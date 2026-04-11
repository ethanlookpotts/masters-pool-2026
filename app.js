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
let fullField = [];
let cutInfo = { score: 0, hasOccurred: false };

async function init() {
    document.getElementById('refresh-btn').addEventListener('click', updateLeaderboard);
    
    const modal = document.getElementById('field-modal');
    const fieldBtn = document.getElementById('field-rankings-btn');
    const closeBtn = document.getElementsByClassName('close-modal')[0];

    fieldBtn.onclick = () => {
        renderFieldModal();
        modal.style.display = "block";
        document.body.style.overflow = "hidden";
    };

    closeBtn.onclick = () => {
        modal.style.display = "none";
        document.body.style.overflow = "auto";
    };

    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = "none";
            document.body.style.overflow = "auto";
        }
    };

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

        const hasCutOccurred = globalRoundNum > 2 || competitors.some(c => c.status?.type?.id === "3");
        cutInfo.hasOccurred = hasCutOccurred;

        const espnHasCutStatus = competitors.some(c => c.status?.type?.id === "3");
        let projectedCutScore = Infinity;
        if (espnHasCutStatus) {
            // If cut occurred, find the worst score of someone who made it
            const madeCut = competitors.filter(c => c.status?.type?.id !== "3" && !c.status?.displayValue?.includes("MC"));
            if (madeCut.length > 0) {
                projectedCutScore = Math.max(...madeCut.map(c => {
                    const s = c.score?.displayValue || c.score;
                    if (s === 'E' || s === 'even') return 0;
                    return parseInt(s?.toString().replace('+', '')) || 0;
                }));
            }
        } else {
            const sortedScores = competitors
                .map(c => {
                    const scoreStr = c.score?.displayValue || c.score;
                    if (scoreStr === 'E' || scoreStr === 'even') return 0;
                    if (typeof scoreStr === 'string') {
                        return parseInt(scoreStr.replace('+', '')) || 0;
                    }
                    return parseInt(scoreStr) || 0;
                })
                .sort((a, b) => a - b);
            
            if (sortedScores.length > 0) {
                const cutIndex = Math.min(50, sortedScores.length) - 1;
                projectedCutScore = sortedScores[cutIndex];
            }
        }
        cutInfo.score = projectedCutScore;

        // Display cut line in header
        const cutDisplayEl = document.getElementById('cut-line-display');
        if (hasCutOccurred) {
            cutDisplayEl.style.display = 'none';
        } else {
            const cutScoreFormatted = projectedCutScore === 0 ? "E" : (projectedCutScore > 0 ? `+${projectedCutScore}` : projectedCutScore);
            cutDisplayEl.innerText = `Projected Cut: ${cutScoreFormatted}`;
            cutDisplayEl.style.display = 'inline-block';
        }

        const playerMap = {};
        const draftedNames = new Set(Object.values(draftData).flat());
        const missingTeeTimeDrafted = [];
        
        fullField = []; // Reset full field

        competitors.forEach(c => {
            const name = c.athlete.displayName;
            const statusType = c.status?.type || {};
            
            const allRounds = c.linescores?.map(ls => ({
                period: ls.period,
                displayValue: ls.displayValue,
                value: ls.value,
                holes: ls.linescores?.map(h => ({
                    hole: h.period,
                    score: h.value,
                    rel: h.scoreType?.displayValue
                })) || [],
                teeTime: ls.statistics?.categories?.[0]?.stats?.find(s => s.displayValue && s.displayValue.includes('2026'))?.displayValue
            })) || [];

            const currentScoreStr = c.score?.displayValue || c.score || 'E';
            let numericScore = 0;
            if (currentScoreStr === 'E' || currentScoreStr === 'even') numericScore = 0;
            else numericScore = parseInt(currentScoreStr.toString().replace('+', '')) || 0;

            // Calculate weekend score (clean slate)
            let weekendNumericScore = 0;
            if (hasCutOccurred || globalRoundNum > 2) {
                const weekendRoundsList = allRounds.filter(r => r.period > 2);
                weekendNumericScore = weekendRoundsList.reduce((total, r) => {
                    if (!r.displayValue || r.displayValue === '-' || r.displayValue === 'E' || r.displayValue === 'even') return total;
                    return total + (parseInt(r.displayValue.toString().replace('+', '')) || 0);
                }, 0);
            }
            const weekendScoreStr = weekendNumericScore === 0 ? 'E' : (weekendNumericScore > 0 ? `+${weekendNumericScore}` : weekendNumericScore.toString());

            const isCut = statusType.id === "3" || 
                          c.status?.displayValue?.includes("MC") || 
                          c.status?.type?.description?.includes("Missed Cut") ||
                          (hasCutOccurred && !espnHasCutStatus && numericScore > projectedCutScore);

            const playerData = {
                id: c.id,
                name: name,
                flag: c.athlete.flag?.href || "",
                score: currentScoreStr,
                numericScore: numericScore,
                weekendScore: weekendScoreStr,
                weekendNumericScore: weekendNumericScore,
                rank: parseInt(c.curline || c.status?.position?.id || c.order) || (isCut ? 999 : 998),
                status: statusType.name || "UNKNOWN", 
                round: globalRoundNum,
                isCut: isCut,
                statusDisplay: c.status?.displayValue,
                allRounds: allRounds,
                thru: "--"
            };

            playerMap[name] = playerData;
            fullField.push(playerData);

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
            } else {
                // Not started today yet
                if (currentRound?.teeTimeDisplay) {
                    p.thru = currentRound.teeTimeDisplay;
                } else if (currentRound?.teeTime) {
                    const timeParts = currentRound.teeTime.split(' ');
                    const timeIdx = timeParts.findIndex(tp => tp.includes(':'));
                    if (timeIdx !== -1) {
                        p.thru = timeParts[timeIdx].substring(0, 5); 
                    } else {
                        p.thru = "Tee Time";
                    }
                } else if (p.statusDisplay) {
                    p.thru = p.statusDisplay;
                } else {
                    p.thru = "--";
                }
            }
        });

        const { prizes: playerPrizes, ranks: playerRanksMap } = calculatePrizesAndRanks(competitors);

        // Update player ranks in playerMap and fullField
        Object.values(playerMap).forEach(p => {
            p.rank = playerRanksMap[p.name] || 999;
        });

        // Calculate rank frequencies for 'T' display
        const rankCounts = {};
        Object.values(playerRanksMap).forEach(r => {
            if (r !== 999 && r !== 998) rankCounts[r] = (rankCounts[r] || 0) + 1;
        });

        const teamStandings = [];
        for (const [drafter, players] of Object.entries(draftData)) {
            let totalProjected = 0;
            let totalActual = 0;
            let makingCutCount = 0;
            let lockedPrize = 0;
            let livePrize = 0;
            
            const playerDetails = players.map(name => {
                const live = playerMap[name] || { name: name, score: '-', rank: '-', thru: '-', isCut: false, roundScores: [] };
                const prize = playerPrizes[name] || 0;
                
                let isMakingCut = false;
                if (hasCutOccurred) {
                    isMakingCut = !live.isCut;
                } else {
                    isMakingCut = live.numericScore <= projectedCutScore;
                }
                if (isMakingCut) {
                    makingCutCount++;
                    livePrize += prize;
                } else {
                    lockedPrize += prize;
                }
                
                totalProjected += prize;
                if (isTournamentOver) totalActual += prize;
                return { ...live, projectedPrize: prize, isMakingCut };
            });

            teamStandings.push({
                drafter,
                totalProjected,
                totalActual,
                makingCutCount,
                lockedPrize,
                livePrize,
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

        renderUI(teamStandings, isTournamentOver, hasCutOccurred, globalRoundNum, rankCounts);
        lastUpdatedEl.innerText = `Last Updated: ${new Date().toLocaleTimeString()}`;

        const fieldBtn = document.getElementById('field-rankings-btn');
        fieldBtn.onclick = () => {
            renderFieldModal(rankCounts);
            document.getElementById('field-modal').style.display = "block";
            document.body.style.overflow = "hidden";
        };
    } catch (err) {
        console.error("Update failed:", err);
        lastUpdatedEl.innerText = "Update failed. Try again.";
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.innerText = "Refresh Leaderboard";
    }
}

function calculatePrizesAndRanks(competitors) {
    const getScoreValue = (c) => {
        const s = c.score?.displayValue || c.score;
        if (s === 'E' || s === 'even' || s === 'even par') return 0;
        return parseInt(s?.toString().replace('+', '')) || 0;
    };

    const isPlayerCut = (c) => {
        return c.status?.type?.id === "3" || 
               c.status?.displayValue?.includes("MC") || 
               c.status?.type?.description?.includes("Missed Cut") ||
               (cutInfo.hasOccurred && getScoreValue(c) > cutInfo.score);
    };

    const sorted = [...competitors].sort((a, b) => {
        const isCutA = isPlayerCut(a);
        const isCutB = isPlayerCut(b);
        if (isCutA && !isCutB) return 1;
        if (!isCutA && isCutB) return -1;
        return getScoreValue(a) - getScoreValue(b);
    });

    const ranks = {};
    const rankGroups = {};
    let currentRank = 1;
    
    sorted.forEach((c, idx) => {
        const isCut = isPlayerCut(c);
        const name = c.athlete.displayName;
        if (isCut) {
            ranks[name] = 999;
        } else {
            if (idx > 0 && getScoreValue(c) !== getScoreValue(sorted[idx - 1])) {
                currentRank = idx + 1;
            }
            ranks[name] = currentRank;
            if (!rankGroups[currentRank]) rankGroups[currentRank] = [];
            rankGroups[currentRank].push(name);
        }
    });

    const prizes = {};
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
        players.forEach(name => { prizes[name] = avgPrize; });
        currentPos += numPlayers;
    });

    competitors.forEach(c => {
        const name = c.athlete.displayName;
        const isCut = isPlayerCut(c);
        if (isCut) {
            prizes[name] = prizeTable.cut;
        }
    });

    return { prizes, ranks };
}

function formatRank(rank, counts) {
    if (rank === 999) return 'MC';
    if (rank === 998) return '--';
    const isTied = counts && counts[rank] > 1;
    return (isTied ? 'T' : '') + rank;
}

function renderUI(standings, isOver, hasCutOccurred, roundNum, rankCounts) {
    const leaderboardEl = document.getElementById('pool-leaderboard');
    
    leaderboardEl.innerHTML = standings.map((team, index) => {
        const activePlayers = [];
        const cutPlayers = [];
        if (hasCutOccurred || roundNum > 2 || isOver) {
            team.players.forEach(p => {
                if (p.isMakingCut) activePlayers.push(p);
                else cutPlayers.push(p);
            });
        } else {
            activePlayers.push(...team.players);
        }

        return `
        <div class="pool-card ${index === 0 ? 'winner' : ''} ${expandedTeams.has(team.drafter) ? 'expanded' : ''}" data-drafter="${team.drafter}">
            <div class="card-summary">
                <div class="rank-drafter">
                    <div class="rank">#${index + 1}</div>
                    <div class="drafter-name">${team.drafter}</div>
                </div>
                <div class="prizes-summary">
                    ${(!hasCutOccurred && roundNum <= 2) ? `
                    <div class="cut-indicator" style="font-size: 0.8rem; color: #666; margin-bottom: 2px;">
                        Proj. Cut: ${team.makingCutCount}/5
                    </div>
                    ` : `
                    <div class="firepower-dots" title="Active Golfers: ${team.makingCutCount}/5">
                        ${Array(5).fill(0).map((_, i) => `<span class="dot ${i < team.makingCutCount ? 'active' : 'cut'}"></span>`).join('')}
                    </div>
                    `}
                    ${(hasCutOccurred || roundNum > 2 || isOver) ? `
                        <div class="prize-split">
                            <div class="prize-live">
                                <div class="projected-label">${isOver ? 'Final Prize' : 'Live Projected'}</div>
                                <div class="projected-amount">$${Math.round(team.livePrize).toLocaleString()}</div>
                            </div>
                            <div class="prize-locked">
                                <div class="projected-label">Locked</div>
                                <div class="locked-amount">$${Math.round(team.lockedPrize).toLocaleString()}</div>
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="caret"></div>
            </div>
            <div class="card-details">
                <h4 style="margin: 1rem 0 0.5rem 0; color: var(--augusta-green); font-size: 0.9rem; text-transform: uppercase;">${(hasCutOccurred || roundNum > 2) ? 'Weekend Roster' : 'Team Details'}</h4>
                <div class="player-header">
                    <div>Player</div>
                    <div style="text-align:center">Score</div>
                    <div style="text-align:center">Rank</div>
                    <div style="text-align:center">Thru</div>
                    ${(hasCutOccurred || roundNum > 2 || isOver) ? `<div style="text-align:right" class="prize-header">Prize</div>` : '<div class="prize-header"></div>'}
                </div>
                ${activePlayers.map(p => `
                    <div class="player-item" style="${(!isOver && !p.isMakingCut && !hasCutOccurred) ? 'opacity: 0.7;' : ''}">
                        <div class="player-main-info">
                            <div class="player-name-flag">
                                <img class="flag-icon" src="${p.flag}" alt="">
                                <div class="player-name">
                                    ${p.name}
                                    ${(!isOver && !hasCutOccurred && roundNum <= 2 && p.isMakingCut) ? '<span style="font-size:0.7rem; color: var(--augusta-green);">(Proj. Cut)</span>' : ''}
                                </div>
                            </div>
                            <div class="player-score">${p.score}</div>
                            <div class="player-rank">${formatRank(p.rank, rankCounts)}</div>
                            <div class="player-thru">${p.thru}</div>
                            ${(hasCutOccurred || roundNum > 2 || isOver) ? `<div class="player-projected">$${Math.round(p.projectedPrize).toLocaleString()}</div>` : '<div class="player-projected"></div>'}
                        </div>
                        <div class="player-rounds-container">
                            ${[...p.allRounds].reverse().map(round => {
                                const holesPlayed = round.holes.length;
                                const scoreDisplay = round.displayValue && round.displayValue !== '-' ? `(${round.displayValue})` : '';
                                const strokesDisplay = round.value > 0 ? round.value : '';
                                
                                return `
                                <div class="player-round-info">
                                    <div class="round-status">
                                        <span>Round ${round.period}</span>
                                        <span style="font-weight: bold;">${strokesDisplay} ${scoreDisplay}</span>
                                    </div>
                                    <div class="scorecard">
                                        ${holesPlayed > 0 ? 
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
                                `;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
                
                ${cutPlayers.length > 0 ? `
                    <h4 class="roster-section-title" style="margin: 1.5rem 0 0.5rem 0; color: #666; font-size: 0.9rem; text-transform: uppercase; border-top: 1px dashed #ccc; padding-top: 1rem;">Missed Cut</h4>
                    ${cutPlayers.map(p => `
                        <div class="player-item condensed" style="padding: 0.5rem 0; border-bottom: 1px solid #f5f5f5;">
                            <div class="player-main-info" style="margin-bottom: 0;">
                                <div class="player-name-flag">
                                    <img class="flag-icon" src="${p.flag}" alt="" style="opacity:0.5">
                                    <div class="player-name" style="opacity:0.6; font-size: 0.9rem;">
                                        ${p.name}
                                        <span style="font-size:0.7rem; color: #d32f2f; font-weight: bold; margin-left: 4px;">[MC]</span>
                                    </div>
                                </div>
                                <div class="player-score" style="opacity:0.6; font-size: 0.9rem;">${p.score}</div>
                                <div class="player-rank" style="opacity:0.6; font-size: 0.9rem;">MC</div>
                                <div class="player-thru" style="opacity:0.6; font-size: 0.9rem;">--</div>
                                <div class="player-projected" style="color: #888; font-size: 0.9rem;">$${Math.round(p.projectedPrize).toLocaleString()}</div>
                            </div>
                        </div>
                    `).join('')}
                ` : ''}
            </div>
        </div>
        `;
    }).join('');

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

function getDrafterForPlayer(playerName) {
    for (const [drafter, players] of Object.entries(draftData)) {
        if (players.includes(playerName)) return drafter;
    }
    return null;
}

function renderFieldModal(rankCounts) {
    const listEl = document.getElementById('field-rankings-list');
    
    // Sort field: first by rank, then by score
    const sortedField = [...fullField].sort((a, b) => {
        if (a.isCut && !b.isCut) return 1;
        if (!a.isCut && b.isCut) return -1;
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.numericScore - b.numericScore;
    });

    // Find the transition point for the cut line
    let cutLineIndex = -1;
    if (cutInfo.hasOccurred) {
        cutLineIndex = sortedField.findIndex(p => p.isCut);
        if (cutLineIndex === -1) {
            cutLineIndex = sortedField.findIndex(p => p.numericScore > cutInfo.score);
        }
    } else {
        // Find first player whose score is worse than projected cut
        cutLineIndex = sortedField.findIndex(p => p.numericScore > cutInfo.score);
    }

    // Limit the list: show everyone above cut, plus 10 below
    let playersToShow = sortedField;
    if (cutLineIndex !== -1) {
        if (cutInfo.hasOccurred) {
            playersToShow = sortedField.slice(0, cutLineIndex);
        } else {
            playersToShow = sortedField.slice(0, cutLineIndex + 10);
        }
    }

    let html = `
        <table class="field-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th style="text-align:center">Score</th>
                    <th style="text-align:right">Thru</th>
                </tr>
            </thead>
            <tbody>
    `;

    playersToShow.forEach((p, idx) => {
        const drafter = getDrafterForPlayer(p.name);
        const drafterLabel = drafter ? `<span class="drafter-label" style="flex-shrink: 0; padding: 1px 3px; font-size: 0.55rem; margin-left: 3px;">${drafter}</span>` : '';
        const isBelowCut = cutLineIndex !== -1 && idx >= cutLineIndex;
        const rowClass = isBelowCut ? 'outside-cut' : '';

        // Format name to "F. Last"
        const nameParts = p.name.split(' ');
        const displayName = nameParts.length > 1 ? `${nameParts[0][0]}. ${nameParts.slice(1).join(' ')}` : p.name;

        // If this is the cut line position, insert a special row
        if (idx === cutLineIndex && cutLineIndex !== -1 && !cutInfo.hasOccurred) {
            html += `
                <tr class="cut-line-row-separator">
                    <td colspan="4" style="text-align:center; padding: 6px 0;">
                        <div style="border-bottom: 2px dashed #d32f2f; position: relative; height: 10px;">
                            <span style="position: absolute; top: 0; left: 50%; transform: translate(-50%, -50%); background: var(--cream-bg); padding: 0 10px; color: #d32f2f; font-weight: 800; font-size: 0.6rem; letter-spacing: 1px;">CUT LINE</span>
                        </div>
                    </td>
                </tr>
            `;
        }

        html += `
            <tr class="${rowClass}">
                <td class="rank-cell" style="padding: 0.4rem 4px;">${formatRank(p.rank, rankCounts)}</td>
                <td class="name-cell" style="padding: 0.4rem 4px;">
                    <div style="display:flex; align-items:center; gap: 4px;">
                        <img class="flag-icon" src="${p.flag}" alt="" style="flex-shrink:0; width: 16px; height: 11px;">
                        <span class="field-player-name" style="font-size: 0.8rem;">${displayName}</span>
                        ${drafterLabel}
                    </div>
                </td>
                <td class="score-cell" style="padding: 0.4rem 4px;">${p.score}</td>
                <td class="thru-cell" style="padding: 0.4rem 4px;">${p.thru}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    listEl.innerHTML = html;
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