const ESPN_API = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const REFRESH_INTERVAL = 60000; // Refresh every 60 seconds

let draftData = {};
let prizeTable = {};

async function init() {
    try {
        const [draftRes, prizeRes] = await Promise.all([
            fetch('draft.json'),
            fetch('prizes.json')
        ]);
        draftData = await draftRes.json();
        prizeTable = await prizeRes.json();
        
        await updateLeaderboard();
        setInterval(updateLeaderboard, REFRESH_INTERVAL);
    } catch (err) {
        console.error("Initialization failed:", err);
    }
}

async function updateLeaderboard() {
    const lastUpdatedEl = document.getElementById('last-updated');
    try {
        const response = await fetch(ESPN_API);
        const data = await response.json();
        
        // Find the Masters event
        const mastersEvent = data.events.find(e => e.name.toLowerCase().includes('masters'));
        if (!mastersEvent) {
            document.getElementById('pool-leaderboard').innerHTML = "<div class='loading'>Masters event not found in active tournaments.</div>";
            return;
        }

        const competitors = mastersEvent.competitions[0].competitors;
        
        // Map ESPN names to our draft names (handle minor variations if any)
        const playerMap = {};
        competitors.forEach(c => {
            const name = c.athlete.displayName;
            playerMap[name] = {
                name: name,
                score: c.score?.displayValue || 'E',
                rank: parseInt(c.curline) || 999,
                status: c.status.type.name, // e.g., "STATUS_IN_PROGRESS", "STATUS_FINAL"
                round: c.linescores?.length || 0,
                thru: c.status.period || (c.status.type.state === 'pre' ? 'Tee Time' : 'F'),
                isCut: c.status.type.id === "3" // 3 is usually missed cut
            };
        });

        // Calculate projected prize money with tie logic
        const playerPrizes = calculateProjectedPrizes(competitors);

        // Calculate pool team totals
        const teamStandings = [];
        for (const [drafter, players] of Object.entries(draftData)) {
            let totalPrize = 0;
            const playerDetails = players.map(name => {
                const live = playerMap[name] || { name: name, score: '-', rank: '-', thru: '-', isCut: false };
                const prize = playerPrizes[name] || 0;
                totalPrize += prize;
                return { ...live, projectedPrize: prize };
            });

            teamStandings.push({
                drafter,
                totalPrize,
                players: playerDetails
            });
        }

        // Sort by total prize (descending)
        teamStandings.sort((a, b) => b.totalPrize - a.totalPrize);

        renderUI(teamStandings);
        lastUpdatedEl.innerText = `Last Updated: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
        console.error("Update failed:", err);
        lastUpdatedEl.innerText = "Update failed. Retrying...";
    }
}

function calculateProjectedPrizes(competitors) {
    // 1. Group by rank
    const rankGroups = {};
    competitors.forEach(c => {
        const rank = parseInt(c.curline) || 999;
        if (c.status.type.id === "3") return; // Missed cut handled later
        if (!rankGroups[rank]) rankGroups[rank] = [];
        rankGroups[rank].push(c.athlete.displayName);
    });

    const projectedPrizes = {};
    const sortedRanks = Object.keys(rankGroups).map(Number).sort((a, b) => a - b);
    
    let currentPos = 1;
    sortedRanks.forEach(rank => {
        const players = rankGroups[rank];
        const numPlayers = players.length;
        
        // Sum prizes for the next N spots
        let sumPrize = 0;
        for (let i = 0; i < numPlayers; i++) {
            const pos = currentPos + i;
            sumPrize += prizeTable[pos] || prizeTable.flat_cut_min || 0;
        }
        
        const avgPrize = sumPrize / numPlayers;
        players.forEach(name => {
            projectedPrizes[name] = avgPrize;
        });
        
        currentPos += numPlayers;
    });

    // Handle missed cut
    competitors.forEach(c => {
        if (c.status.type.id === "3") {
            projectedPrizes[c.athlete.displayName] = prizeTable.cut;
        }
    });

    return projectedPrizes;
}

function renderUI(standings) {
    const leaderboardEl = document.getElementById('pool-leaderboard');
    const teamsEl = document.getElementById('team-details');
    
    leaderboardEl.innerHTML = standings.map((team, index) => `
        <div class="pool-card ${index === 0 ? 'winner' : ''}">
            <div style="display: flex; align-items: center;">
                <div class="rank">#${index + 1}</div>
                <div class="info">
                    <h3>${team.drafter}</h3>
                    <p style="font-size: 0.8rem; color: #666;">5 Players Active</p>
                </div>
            </div>
            <div class="prize">$${team.totalPrize.toLocaleString()}</div>
        </div>
    `).join('');

    teamsEl.innerHTML = standings.map(team => `
        <div class="team-section">
            <h3>${team.drafter}'s Team</h3>
            <div class="player-row header">
                <div class="name">Player</div>
                <div class="score">Score</div>
                <div class="pos">Pos</div>
                <div class="money">Prize</div>
            </div>
            ${team.players.map(p => `
                <div class="player-row ${p.isCut ? 'missed-cut' : ''}">
                    <div class="name">${p.name}</div>
                    <div class="score">${p.score}</div>
                    <div class="pos">${p.rank === 999 ? 'MC' : 'T' + p.rank}</div>
                    <div class="money">$${p.projectedPrize.toLocaleString()}</div>
                </div>
            `).join('')}
            <div class="player-row" style="border-top: 2px solid #eee; margin-top: 5px; font-weight: 700;">
                <div class="name">Total</div>
                <div></div>
                <div></div>
                <div class="money">$${team.totalPrize.toLocaleString()}</div>
            </div>
        </div>
    `).join('');
}

init();