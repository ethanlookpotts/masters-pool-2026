const ESPN_API = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

const draftData = {
  "John": ["Scottie Scheffler", "Patrick Cantlay", "Sungjae Im", "Wyndham Clark", "Cameron Smith"],
  "James": ["Rory McIlroy", "Si Woo Kim", "Jacob Bridgeman", "Sepp Straka", "Maverick McNealy"],
  "Bryan": ["Jon Rahm", "Min Woo Lee", "Robert MacIntyre", "Adam Scott", "Corey Conners"],
  "Justin": ["Cameron Young", "Hideki Matsuyama", "Patrick Reed", "Russell Henley", "J.J. Spaun"],
  "Joe": ["Xander Schauffele", "Collin Morikawa", "Justin Thomas", "Keegan Bradley", "Harris English"],
  "Jeff": ["Bryson DeChambeau", "Justin Rose", "Akshay Bhatia", "Shane Lowry", "Tyrrell Hatton"],
  "Bergen": ["Ludvig Åberg", "Viktor Hovland", "Brooks Koepka", "Chris Gotterup", "Nicolai Højgaard"],
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

let expandedTeams = new Set();

async function init() {
    document.getElementById('refresh-btn').addEventListener('click', updateLeaderboard);
    await updateLeaderboard();
}

async function updateLeaderboard() {
    const lastUpdatedEl = document.getElementById('last-updated');
    const refreshBtn = document.getElementById('refresh-btn');
    
    refreshBtn.disabled = true;
    refreshBtn.innerText = "Refreshing...";

    try {
        const response = await fetch(ESPN_API);
        const data = await response.json();
        
        const mastersEvent = data.events.find(e => e.name.toLowerCase().includes('masters'));
        if (!mastersEvent) {
            document.getElementById('pool-leaderboard').innerHTML = "<div class='loading'>Masters event not found.</div>";
            return;
        }

        const competition = mastersEvent.competitions[0];
        const competitors = competition.competitors;
        const isTournamentOver = competition.status?.type?.state === 'post';

        const playerMap = {};
        competitors.forEach(c => {
            const name = c.athlete.displayName;
            const statusType = c.status?.type || {};
            
            // Get current round object
            const roundNum = c.status?.period || (c.linescores ? c.linescores.length : 0);
            const currentRoundObj = c.linescores?.find(ls => ls.period === roundNum) || c.linescores?.[c.linescores.length - 1];
            
            const roundScores = currentRoundObj?.linescores?.map(ls => ({
                hole: ls.period,
                score: ls.value,
                rel: ls.scoreType?.displayValue
            })) || [];

            // Robust Thru calculation
            let thru = "Tee Time";
            if (isTournamentOver) {
                thru = "F";
            } else if (statusType.id === "3") {
                thru = "MC";
            } else if (roundScores.length > 0) {
                thru = roundScores.length === 18 ? "F" : roundScores.length;
            } else if (c.status?.displayValue) {
                thru = c.status.displayValue;
            }

            playerMap[name] = {
                name: name,
                score: c.score?.displayValue || c.score || 'E',
                rank: parseInt(c.curline || c.status?.position?.id || c.order) || 999,
                status: statusType.name || "UNKNOWN", 
                round: roundNum,
                thru: thru,
                isCut: statusType.id === "3",
                roundScores: roundScores
            };
        });

        const playerPrizes = calculateProjectedPrizes(competitors);

        const teamStandings = [];
        for (const [drafter, players] of Object.entries(draftData)) {
            let totalProjected = 0;
            let totalActual = 0;
            
            const playerDetails = players.map(name => {
                const live = playerMap[name] || { name: name, score: '-', rank: '-', thru: '-', isCut: false, roundScores: [] };
                const prize = playerPrizes[name] || 0;
                totalProjected += prize;
                if (isTournamentOver) totalActual += prize;
                return { ...live, projectedPrize: prize };
            });

            teamStandings.push({
                drafter,
                totalProjected,
                totalActual,
                players: playerDetails
            });
        }

        // Rank by projected unless tournament is over
        teamStandings.sort((a, b) => b.totalProjected - a.totalProjected);

        renderUI(teamStandings, isTournamentOver);
        lastUpdatedEl.innerText = `Last Updated: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
        console.error("Update failed:", err);
        lastUpdatedEl.innerText = "Update failed. Try again.";
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.innerText = "Refresh Leaderboard";
    }
}

function calculateProjectedPrizes(competitors) {
    const rankGroups = {};
    competitors.forEach(c => {
        const rank = parseInt(c.curline || c.status?.position?.id || c.order) || 999;
        if (c.status?.type?.id === "3" && c.status?.type?.state !== 'post') return; 
        if (!rankGroups[rank]) rankGroups[rank] = [];
        rankGroups[rank].push(c.athlete.displayName);
    });

    const projectedPrizes = {};
    const sortedRanks = Object.keys(rankGroups).map(Number).sort((a, b) => a - b);
    
    let currentPos = 1;
    sortedRanks.forEach(rank => {
        const players = rankGroups[rank];
        const numPlayers = players.length;
        let sumPrize = 0;
        for (let i = 0; i < numPlayers; i++) {
            const pos = currentPos + i;
            sumPrize += prizeTable[pos] || prizeTable.flat_cut_min || 0;
        }
        const avgPrize = sumPrize / numPlayers;
        players.forEach(name => { projectedPrizes[name] = avgPrize; });
        currentPos += numPlayers;
    });

    competitors.forEach(c => {
        if (c.status?.type?.id === "3" && c.status?.type?.state !== 'post') {
            projectedPrizes[c.athlete.displayName] = prizeTable.cut;
        }
    });
    return projectedPrizes;
}

function renderUI(standings, isOver) {
    const leaderboardEl = document.getElementById('pool-leaderboard');
    
    leaderboardEl.innerHTML = standings.map((team, index) => `
        <div class="pool-card ${index === 0 ? 'winner' : ''} ${expandedTeams.has(team.drafter) ? 'expanded' : ''}" data-drafter="${team.drafter}">
            <div class="card-summary">
                <div class="rank-drafter">
                    <div class="rank">#${index + 1}</div>
                    <div class="drafter-name">${team.drafter}</div>
                </div>
                <div class="prizes-summary">
                    <div class="projected-label">${isOver ? 'Final Prize' : 'Projected Prize'}</div>
                    <div class="projected-amount">$${team.totalProjected.toLocaleString()}</div>
                    ${!isOver ? `<div class="actual-amount">Actual: $${team.totalActual.toLocaleString()}</div>` : ''}
                </div>
                <div class="caret"></div>
            </div>
            <div class="card-details">
                <h4 style="margin: 1rem 0 0.5rem 0; color: var(--augusta-green); font-size: 0.9rem; text-transform: uppercase;">Team Details</h4>
                <div class="player-header">
                    <div>Player</div>
                    <div style="text-align:center">Score</div>
                    <div style="text-align:center">Rank</div>
                    <div style="text-align:center">Thru</div>
                    <div style="text-align:right">Prize</div>
                </div>
                ${team.players.map(p => `
                    <div class="player-item">
                        <div class="player-main-info">
                            <div class="player-name">${p.name}</div>
                            <div class="player-score">${p.score}</div>
                            <div class="player-rank">${p.rank === 999 ? 'MC' : 'T' + p.rank}</div>
                            <div class="player-thru">${p.thru}</div>
                            <div class="player-projected">$${p.projectedPrize.toLocaleString()}</div>
                        </div>
                        ${p.roundScores.length > 0 ? `
                            <div class="player-round-info">
                                <div class="round-status">Round ${p.round} Scorecard</div>
                                <div class="scorecard">
                                    ${p.roundScores.map(rs => `
                                        <div class="hole">
                                            <div class="hole-num">${rs.hole}</div>
                                            <div class="hole-score ${getScoreClass(rs.rel)}">${rs.score}</div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    // Add click listeners for expansion
    document.querySelectorAll('.card-summary').forEach(summary => {
        summary.addEventListener('click', () => {
            const card = summary.parentElement;
            const drafter = card.dataset.drafter;
            if (expandedTeams.has(drafter)) {
                expandedTeams.delete(drafter);
                card.classList.remove('expanded');
            } else {
                expandedTeams.add(drafter);
                card.classList.add('expanded');
            }
        });
    });
}

function getScoreClass(rel) {
    if (!rel || rel === 'E') return '';
    const r = parseInt(rel);
    if (r <= -2) return 'eagle';
    if (r === -1) return 'birdie';
    if (r === 1) return 'bogey';
    if (r >= 2) return 'double';
    return '';
}

init();