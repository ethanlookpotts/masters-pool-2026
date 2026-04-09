const ESPN_API = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const REFRESH_INTERVAL = 60000; // Refresh every 60 seconds

const draftData = {
  "John": ["Scottie Scheffler", "Patrick Cantlay", "Sungjae Im", "Wyndham Clark", "Cameron Smith"],
  "James": ["Rory McIlroy", "Si Woo Kim", "Jacob Bridgeman", "Sepp Straka", "Maverick McNealy"],
  "Bryan": ["Jon Rahm", "Min Woo Lee", "Robert MacIntyre", "Adam Scott", "Corey Conners"],
  "Justin": ["Cameron Young", "Hideki Matsuyama", "Patrick Reed", "Russell Henley", "JJ Spaun"],
  "Joe": ["Xander Schauffele", "Collin Morikawa", "Justin Thomas", "Keegan Bradley", "Harris English"],
  "Jeff": ["Bryson DeChambeau", "Justin Rose", "Akshay Bhatia", "Shane Lowry", "Tyrrell Hatton"],
  "Bergen": ["Ludvig Åberg", "Viktor Hovland", "Brooks Koepka", "Chris Gotterup", "Nicolai Hojgaard"],
  "Ethan": ["Matt Fitzpatrick", "Tommy Fleetwood", "Jordan Spieth", "Jake Knapp", "Casey Jarvis"]
};

const prizeTable = {
  "1": 4200000, "2": 2268000, "3": 1428000, "4": 1008000, "5": 840000,
  "6": 756000, "7": 703500, "8": 651000, "9": 609000, "10": 567000,
  "11": 525000, "12": 483000, "13": 441000, "14": 399000, "15": 378000,
  "16": 357000, "17": 336000, "18": 315000, "19": 294000, "20": 273000,
  "21": 252000, "22": 235200, "23": 218400, "24": 201600, "25": 184800,
  "26": 168000, "27": 161700, "28": 155400, "29": 149100, "30": 142800,
  "31": 136500, "32": 130200, "33": 123900, "34": 118650, "35": 113400,
  "36": 108150, "37": 102900, "38": 98700, "39": 94500, "40": 90300,
  "41": 86100, "42": 81900, "43": 77700, "44": 73500, "45": 69300,
  "46": 65100, "47": 60900, "48": 57540, "49": 54600, "50": 52920,
  "cut": 25000,
  "flat_cut_min": 40000
};

async function init() {
    try {
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
            const statusType = c.status?.type || {};
            playerMap[name] = {
                name: name,
                score: c.score?.displayValue || c.score || 'E',
                rank: parseInt(c.curline || c.status?.position?.id || c.order) || 999,
                status: statusType.name || "UNKNOWN", 
                round: c.linescores?.length || 0,
                thru: c.status?.period || (statusType.state === 'pre' ? 'Tee Time' : 'F'),
                isCut: statusType.id === "3" // 3 is usually missed cut
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
        const rank = parseInt(c.curline || c.status?.position?.id || c.order) || 999;
        if (c.status?.type?.id === "3") return; // Missed cut handled later
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
        if (c.status?.type?.id === "3") {
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