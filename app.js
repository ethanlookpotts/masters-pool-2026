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
        const globalRoundNum = competition.status?.period || 1;
        const isTournamentOver = competition.status?.type?.state === 'post' && globalRoundNum >= 4;

        const hasCutOccurred = competitors.some(c => c.status?.type?.id === "3");

        let projectedCutScore = Infinity;
        if (!hasCutOccurred && globalRoundNum <= 2) {
            const sortedScores = competitors
                .map(c => {
                    const scoreStr = c.score?.displayValue || c.score;
                    return scoreStr === 'E' ? 0 : (parseInt(scoreStr) || 0);
                })
                .sort((a, b) => a - b);
            if (sortedScores.length >= 50) {
                projectedCutScore = sortedScores[49];
            } else if (sortedScores.length > 0) {
                projectedCutScore = sortedScores[sortedScores.length - 1];
            }
        }

        const playerMap = {};
        const draftedNames = new Set(Object.values(draftData).flat());
        const missingTeeTimeDrafted = [];

        competitors.forEach(c => {
            const name = c.athlete.displayName;
            const statusType = c.status?.type || {};
            
            // Get round number and scores for ALL rounds
            const allRounds = c.linescores?.map(ls => ({
                period: ls.period,
                displayValue: ls.displayValue,
                holes: ls.linescores?.map(h => ({
                    hole: h.period,
                    score: h.value,
                    rel: h.scoreType?.displayValue
                })) || [],
                teeTime: ls.statistics?.categories?.[0]?.stats?.slice(-1)[0]?.displayValue
            })) || [];

            playerMap[name] = {
                id: c.id,
                name: name,
                flag: c.athlete.flag?.href || "",
                score: c.score?.displayValue || c.score || 'E',
                rank: parseInt(c.curline || c.status?.position?.id || c.order) || 999,
                status: statusType.name || "UNKNOWN", 
                round: globalRoundNum,
                isCut: statusType.id === "3",
                statusDisplay: c.status?.displayValue,
                allRounds: allRounds,
                thru: "--"
            };

            if (draftedNames.has(name)) {
                missingTeeTimeDrafted.push(playerMap[name]);
            }
        });

        // Hybrid Approach: Fetch missing tee times from Core API for drafted players
        const promises = missingTeeTimeDrafted.map(async (p) => {
            // Only fetch if a current/future round has no holes played and no tee time
            const needsCoreFetch = p.allRounds.some(r => !r.teeTime && r.holes.length === 0 && r.period >= globalRoundNum);
            if (!needsCoreFetch || !mastersEvent.id || !competition.id) return;
            
            try {
                const url = `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${mastersEvent.id}/competitions/${competition.id}/competitors/${p.id}/linescores?lang=en&region=us`;
                const resp = await fetch(url);
                const data = await resp.json();
                
                if (data.items && Array.isArray(data.items)) {
                    data.items.forEach(ls => {
                        const roundObj = p.allRounds.find(r => r.period === ls.period);
                        if (roundObj && !roundObj.teeTime && ls.teeTime) {
                            const date = new Date(ls.teeTime);
                            roundObj.teeTimeDisplay = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }
                    });
                }
            } catch (e) {
                console.error("Core API fetch failed for", p.name, e);
            }
        });
        
        await Promise.all(promises);

        // Now calculate thru for everyone
        Object.values(playerMap).forEach(p => {
            const currentRound = p.allRounds.find(r => r.period === globalRoundNum);
            const holesPlayedToday = currentRound?.holes?.length || 0;

            if (isTournamentOver) {
                p.thru = "F";
            } else if (p.isCut) {
                p.thru = "MC";
            } else if (holesPlayedToday > 0) {
                p.thru = holesPlayedToday === 18 ? "F" : holesPlayedToday;
            } else if (currentRound?.teeTimeDisplay) {
                p.thru = currentRound.teeTimeDisplay;
            } else if (currentRound?.teeTime) {
                const timeParts = currentRound.teeTime.split(' ');
                if (timeParts.length >= 4) {
                    p.thru = timeParts[3].substring(0, 5); 
                } else {
                    p.thru = "Tee Time";
                }
            } else if (p.statusDisplay) {
                p.thru = p.statusDisplay;
            }
        });

        const playerPrizes = calculateProjectedPrizes(competitors);

        const teamStandings = [];
        for (const [drafter, players] of Object.entries(draftData)) {
            let totalProjected = 0;
            let totalActual = 0;
            let makingCutCount = 0;
            
            const playerDetails = players.map(name => {
                const live = playerMap[name] || { name: name, score: '-', rank: '-', thru: '-', isCut: false, roundScores: [] };
                const prize = playerPrizes[name] || 0;
                
                let isMakingCut = false;
                if (hasCutOccurred) {
                    isMakingCut = !live.isCut;
                } else {
                    const scoreNum = live.score === 'E' ? 0 : (parseInt(live.score) || 0);
                    isMakingCut = scoreNum <= projectedCutScore;
                }
                if (isMakingCut) makingCutCount++;
                
                totalProjected += prize;
                if (isTournamentOver) totalActual += prize;
                return { ...live, projectedPrize: prize, isMakingCut };
            });

            teamStandings.push({
                drafter,
                totalProjected,
                totalActual,
                makingCutCount,
                players: playerDetails
            });
        }

        teamStandings.sort((a, b) => {
            if (!isTournamentOver && !hasCutOccurred && globalRoundNum <= 2) {
                if (b.makingCutCount !== a.makingCutCount) {
                    return b.makingCutCount - a.makingCutCount;
                }
            }
            return b.totalProjected - a.totalProjected;
        });

        renderUI(teamStandings, isTournamentOver, hasCutOccurred, globalRoundNum);
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

function renderUI(standings, isOver, hasCutOccurred, roundNum) {
    const leaderboardEl = document.getElementById('pool-leaderboard');
    
    leaderboardEl.innerHTML = standings.map((team, index) => `
        <div class="pool-card ${index === 0 ? 'winner' : ''} ${expandedTeams.has(team.drafter) ? 'expanded' : ''}" data-drafter="${team.drafter}">
            <div class="card-summary">
                <div class="rank-drafter">
                    <div class="rank">#${index + 1}</div>
                    <div class="drafter-name">${team.drafter}</div>
                </div>
                <div class="prizes-summary">
                    ${!isOver ? `
                    <div class="cut-indicator" style="font-size: 0.8rem; color: #666; margin-bottom: 2px;">
                        ${(!hasCutOccurred && roundNum <= 2) ? `Proj. Cut: ${team.makingCutCount}/5` : `Made Cut: ${team.makingCutCount}/5`}
                    </div>
                    ` : ''}
                    ${(hasCutOccurred || roundNum > 2 || isOver) ? `
                        <div class="projected-label">${isOver ? 'Final Prize' : 'Projected Prize'}</div>
                        <div class="projected-amount">$${team.totalProjected.toLocaleString()}</div>
                    ` : ''}
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
                    ${(hasCutOccurred || roundNum > 2 || isOver) ? `<div style="text-align:right">Prize</div>` : '<div></div>'}
                </div>
                ${team.players.map(p => `
                    <div class="player-item" style="${(!isOver && !p.isMakingCut && !hasCutOccurred) ? 'opacity: 0.7;' : (p.isCut ? 'opacity: 0.5;' : '')}">
                        <div class="player-main-info">
                            <div class="player-name-flag">
                                <img class="flag-icon" src="${p.flag}" alt="">
                                <div class="player-name">
                                    ${p.name}
                                    ${(!isOver && !hasCutOccurred && roundNum <= 2 && p.isMakingCut) ? '<span style="font-size:0.7rem; color: var(--augusta-green);">(Proj. Cut)</span>' : ''}
                                    ${(!isOver && hasCutOccurred && !p.isCut) ? '<span style="font-size:0.7rem; color: var(--augusta-green);">(Made Cut)</span>' : ''}
                                    ${(p.isCut) ? '<span style="font-size:0.7rem; color: #d32f2f;">(MC)</span>' : ''}
                                </div>
                            </div>
                            <div class="player-score">${p.score}</div>
                            <div class="player-rank">${p.rank === 999 ? 'MC' : 'T' + p.rank}</div>
                            <div class="player-thru">${p.thru}</div>
                            ${(hasCutOccurred || roundNum > 2 || isOver) ? `<div class="player-projected">$${p.projectedPrize.toLocaleString()}</div>` : '<div></div>'}
                        </div>
                        <div class="player-rounds-container">
                            ${p.allRounds.map(round => `
                                <div class="player-round-info">
                                    <div class="round-status">
                                        <span>Round ${round.period}</span>
                                        <span>${round.displayValue || 'E'}</span>
                                    </div>
                                    <div class="scorecard">
                                        ${round.holes.length > 0 ? 
                                            round.holes.map(h => `
                                                <div class="hole">
                                                    <div class="hole-num">${h.hole}</div>
                                                    <div class="hole-score ${getScoreClass(h.rel)}">${h.score}</div>
                                                </div>
                                            `).join('') : 
                                            `<div style="font-size: 0.65rem; color: #999;">Tee Time: ${round.teeTimeDisplay ? round.teeTimeDisplay : (round.teeTime ? round.teeTime.split(' ')[3].substring(0, 5) : 'N/A')}</div>`
                                        }
                                    </div>
                                </div>
                            `).join('')}
                        </div>
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