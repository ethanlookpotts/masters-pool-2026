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

// 2026 Masters purse: $22.5M. Missed cut: $25,000. Positions 51-54 listed.
// flat_cut_min is a floor for made-cut players past position 54 (ties pushing field deep).
const prizeTable = {
  "1": 4500000, "2": 2430000, "3": 1530000, "4": 1080000, "5": 900000,
  "6": 810000, "7": 753750, "8": 697500, "9": 652500, "10": 607500,
  "11": 562500, "12": 517500, "13": 472500, "14": 427500, "15": 405000,
  "16": 382500, "17": 360000, "18": 337500, "19": 315000, "20": 292500,
  "21": 270000, "22": 252000, "23": 234000, "24": 216000, "25": 198000,
  "26": 180000, "27": 172250, "28": 166500, "29": 159750, "30": 153000,
  "31": 146250, "32": 139500, "33": 132750, "34": 127125, "35": 121500,
  "36": 115875, "37": 110250, "38": 105750, "39": 101250, "40": 96750,
  "41": 92250, "42": 87750, "43": 83250, "44": 78750, "45": 74250,
  "46": 69750, "47": 65250, "48": 61650, "49": 58500, "50": 56700,
  "51": 55350, "52": 54000, "53": 52650, "54": 51300,
  "cut": 25000,
  "flat_cut_min": 51300
};

let expandedTeams = new Set();
let fullField = [];
let cutInfo = { score: 0, hasOccurred: false };
let fieldModalFilter = 'all'; // 'all' | 'drafted'
let lastFetchAt = null;
let latestCompetitors = null;
let latestRankCounts = {};

const AUTO_REFRESH_MS = 60_000;

async function init() {
    document.getElementById('refresh-btn').addEventListener('click', () => updateLeaderboard());

    document.getElementById('field-rankings-btn').onclick = () => {
        renderFieldModal(latestRankCounts);
        openModal(document.getElementById('field-modal'));
    };

    document.getElementById('scenarios-btn').onclick = () => {
        renderScenariosModal();
        openModal(document.getElementById('scenarios-modal'));
    };

    document.getElementById('help-btn').onclick = () => {
        renderHelpModal();
        openModal(document.getElementById('help-modal'));
    };

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => closeAllModals();
    });

    window.addEventListener('click', (event) => {
        if (event.target.classList?.contains('modal')) closeAllModals();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllModals();
    });

    await updateLeaderboard();

    setInterval(updateLeaderboard, AUTO_REFRESH_MS);
    setInterval(updateTimeSince, 10_000);
}

function updateTimeSince() {
    if (!lastFetchAt) return;
    const el = document.getElementById('last-updated');
    const secs = Math.round((Date.now() - lastFetchAt) / 1000);
    let text;
    if (secs < 10) text = "just now";
    else if (secs < 60) text = `${secs}s ago`;
    else if (secs < 3600) text = `${Math.round(secs / 60)}m ago`;
    else text = `${Math.round(secs / 3600)}h ago`;
    el.innerText = `Updated ${text}`;
}

function openModal(modal) {
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = "none");
    document.body.style.overflow = "auto";
}

function renderHelpModal() {
    const el = document.getElementById('help-modal-body');
    const fmtPrize = (n) => '$' + n.toLocaleString();
    const payoutRows = [];
    for (let p = 1; p <= 50; p++) {
        payoutRows.push(`<tr><td>${p}</td><td>${fmtPrize(prizeTable[p])}</td></tr>`);
    }

    el.innerHTML = `
        <section class="help-section">
            <h3>Scorecard Key</h3>
            <div class="help-key-grid">
                <div class="help-key-item"><span class="hole-score eagle">2</span><div><strong>Eagle</strong><span>2 under par</span></div></div>
                <div class="help-key-item"><span class="hole-score birdie">3</span><div><strong>Birdie</strong><span>1 under par</span></div></div>
                <div class="help-key-item"><span class="hole-score par">4</span><div><strong>Par</strong><span>even</span></div></div>
                <div class="help-key-item"><span class="hole-score bogey">5</span><div><strong>Bogey</strong><span>1 over par</span></div></div>
                <div class="help-key-item"><span class="hole-score double">6</span><div><strong>Double+</strong><span>2+ over par</span></div></div>
            </div>
        </section>

        <section class="help-section">
            <h3>Pool Format</h3>
            <p>Winner-take-all, $10 buy-in. 8 drafters, 5 golfers each (snake draft). Team rank = total prize money earned by your 5 golfers.</p>
        </section>

        <section class="help-section">
            <h3>Team Total &amp; Locked</h3>
            <p>The big number on each team card is the <strong>projected final total</strong> — the sum of what all 5 golfers would earn if the tournament ended now.</p>
            <p>"$X locked in" shows how much of that total is already <strong>guaranteed</strong> from golfers who missed the cut ($25k each). The rest can still move as scores change.</p>
            <p>Gap under the total shows how far behind (or how many are ahead of) #1.</p>
            <p>Pre-cut, teams rank first by projected golfers making the cut, then by total $. Post-cut, by total $ only.</p>
        </section>

        <section class="help-section">
            <h3>Scenarios</h3>
            <p>Tap <strong>Scenarios</strong> in the header to see how each team would finish if a particular top-remaining golfer wins. Useful on Sunday.</p>
        </section>

        <section class="help-section">
            <h3>Cut Rule</h3>
            <p>After 36 holes, the top 50 + ties make the weekend. Golfers who miss the cut receive $25,000 (Masters consolation).</p>
            <p>During rounds 1–2, "Proj. Cut" shows the current 50th-place score — the projected cut line.</p>
        </section>

        <section class="help-section">
            <h3>Tie Handling</h3>
            <p>When golfers tie, they split the combined prize money for those positions equally (e.g. T2 splits 2nd + 3rd prize).</p>
        </section>

        <section class="help-section">
            <h3>2026 Payout Table ($22.5M Purse)</h3>
            <div class="help-payout-wrap">
                <table class="help-payout">
                    <thead><tr><th>Pos</th><th>Prize</th></tr></thead>
                    <tbody>${payoutRows.join('')}</tbody>
                </table>
            </div>
            <p class="help-note">51st and below: ~$${prizeTable[51].toLocaleString()} down to ~$${prizeTable[54].toLocaleString()}. Missed cut: ${fmtPrize(prizeTable.cut)}.</p>
        </section>
    `;
}

async function updateLeaderboard() {
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.classList.add('refreshing');

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
        latestCompetitors = competitors;
        const globalRoundNum = competition.status?.period || 1;
        const statusState = competition.status?.type?.state;
        const isTournamentOver = statusState === 'post' && globalRoundNum >= 4;
        renderTournamentStatus(statusState, globalRoundNum, isTournamentOver);

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
            let makingCutCount = 0;
            let lockedPrize = 0;
            let livePrize = 0;

            const playerDetails = players.map(name => {
                const live = playerMap[name] || { name: name, score: '-', rank: '-', thru: '-', isCut: false, allRounds: [] };
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
                return { ...live, projectedPrize: prize, isMakingCut };
            });

            const topContributor = findTopContributor(playerDetails, hasCutOccurred);
            const roundBreakdown = computeRoundBreakdown(playerDetails);

            teamStandings.push({
                drafter,
                totalProjected,
                makingCutCount,
                lockedPrize,
                livePrize,
                players: playerDetails,
                topContributor,
                roundBreakdown
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

        latestRankCounts = rankCounts;
        renderUI(teamStandings, isTournamentOver, hasCutOccurred, globalRoundNum, rankCounts);

        lastFetchAt = Date.now();
        updateTimeSince();
    } catch (err) {
        console.error("Update failed:", err);
        document.getElementById('last-updated').innerText = "Update failed. Retrying…";
    } finally {
        refreshBtn.classList.remove('refreshing');
    }
}

function renderTournamentStatus(state, roundNum, isOver) {
    const el = document.getElementById('tournament-status');
    if (!el) return;
    let text = '';
    let cls = 'tournament-status';
    if (isOver) { text = 'Final'; cls += ' final'; }
    else if (state === 'pre') { text = `Round ${roundNum} · Scheduled`; cls += ' scheduled'; }
    else if (state === 'in') { text = `Round ${roundNum} · Live`; cls += ' live'; }
    else { text = `Round ${roundNum}`; }
    el.innerText = text;
    el.className = cls;
}

function findTopContributor(players, hasCutOccurred) {
    const active = players.filter(p => !p.isCut && typeof p.numericScore === 'number');
    if (!active.length) return null;
    const best = active.reduce((a, b) => (a.numericScore <= b.numericScore ? a : b));
    return best;
}

function computeRoundBreakdown(players) {
    const rounds = [1, 2, 3, 4];
    return rounds.map(r => {
        let total = 0;
        let hasData = false;
        players.forEach(p => {
            const round = p.allRounds?.find(rd => rd.period === r);
            if (round && round.value && round.holes?.length === 18) {
                total += parseInt(round.displayValue?.replace('+', '')) || 0;
                hasData = true;
            }
        });
        return { round: r, total: hasData ? total : null };
    });
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

    // Pre-cut: players projected to miss cut should earn cut consolation ($25k),
    // not their current position prize. Keep rank intact so leaderboard shows true position.
    if (!cutInfo.hasOccurred && cutInfo.score !== Infinity) {
        competitors.forEach(c => {
            const name = c.athlete.displayName;
            if (!isPlayerCut(c) && getScoreValue(c) > cutInfo.score) {
                prizes[name] = prizeTable.cut;
            }
        });
    }

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
    const showPrizes = hasCutOccurred || roundNum > 2 || isOver;

    leaderboardEl.innerHTML = standings.map((team, index) => {
        const activePlayers = [];
        const cutPlayers = [];
        if (showPrizes) {
            team.players.forEach(p => {
                if (p.isMakingCut) activePlayers.push(p);
                else cutPlayers.push(p);
            });
        } else {
            activePlayers.push(...team.players);
        }

        const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
        const total = Math.round(team.totalProjected);
        const leadingBadge = index === 0
            ? `<div class="leading-badge">${isOver ? 'CHAMPION' : 'LEADING'}</div>`
            : '';

        const topC = team.topContributor;
        const topContribHtml = topC
            ? `<div class="top-contributor" title="Team leader">
                <span class="tc-label">Top:</span>
                <span class="tc-name">${shortName(topC.name)}</span>
                <span class="tc-score">${topC.score}</span>
                <span class="tc-rank">${formatRank(topC.rank, rankCounts)}</span>
               </div>`
            : '';

        const dotsHtml = `
            <div class="firepower" title="Golfers still in: ${team.makingCutCount}/5">
                <div class="firepower-dots">
                    ${Array(5).fill(0).map((_, i) => `<span class="dot ${i < team.makingCutCount ? 'active' : 'cut'}"></span>`).join('')}
                </div>
                <div class="firepower-label">${team.makingCutCount}/5 ${showPrizes ? 'in' : 'proj.'}</div>
            </div>`;

        const prizeBlockHtml = showPrizes
            ? `<div class="prize-block">
                <div class="total-amount">$${total.toLocaleString()}</div>
                ${leadingBadge}
                ${team.lockedPrize > 0 ? `<div class="locked-note">$${Math.round(team.lockedPrize).toLocaleString()} locked in</div>` : ''}
               </div>`
            : `<div class="prize-block">
                <div class="pre-cut-note">${team.makingCutCount}/5 projected to make cut</div>
               </div>`;

        return `
        <div class="pool-card ${rankClass} ${expandedTeams.has(team.drafter) ? 'expanded' : ''}" data-drafter="${team.drafter}">
            <div class="card-summary">
                <div class="rank-drafter">
                    <div class="rank">#${index + 1}</div>
                    <div class="drafter-name">${team.drafter}</div>
                </div>
                ${topContribHtml}
                ${dotsHtml}
                ${prizeBlockHtml}
                <div class="caret"></div>
            </div>
            <div class="card-details">
                ${renderRoundBreakdownHtml(team.roundBreakdown)}
                <h4 class="roster-heading">${(hasCutOccurred || roundNum > 2) ? 'Weekend Roster' : 'Team Details'}</h4>
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
                                            `<div class="tee-time-display">Tee Time: ${round.teeTimeDisplay ? round.teeTimeDisplay : (round.teeTime ? round.teeTime.split(' ')[3].substring(0, 5) : 'N/A')}</div>`
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
    const draftedSet = new Set(Object.values(draftData).flat());

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

    // Limit the list based on filter + cut
    let playersToShow = sortedField;
    if (fieldModalFilter === 'drafted') {
        playersToShow = sortedField.filter(p => draftedSet.has(p.name));
        cutLineIndex = -1; // don't show cut-line separator in drafted-only view
    } else if (cutInfo.hasOccurred) {
        playersToShow = sortedField.filter(p => !p.isCut);
    } else if (cutLineIndex !== -1) {
        playersToShow = sortedField.slice(0, cutLineIndex + 10);
    }

    let html = `
        <div class="field-toggle">
            <button class="field-toggle-btn ${fieldModalFilter === 'all' ? 'active' : ''}" data-filter="all">Full Field</button>
            <button class="field-toggle-btn ${fieldModalFilter === 'drafted' ? 'active' : ''}" data-filter="drafted">Drafted Only</button>
        </div>
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

    listEl.querySelectorAll('.field-toggle-btn').forEach(btn => {
        btn.onclick = () => {
            fieldModalFilter = btn.dataset.filter;
            renderFieldModal(rankCounts);
        };
    });
}

function getScoreClass(rel) {
    if (!rel || rel === 'E') return 'par';
    const r = parseInt(rel);
    if (r <= -2) return 'eagle';
    if (r === -1) return 'birdie';
    if (r === 1) return 'bogey';
    if (r >= 2) return 'double';
    return 'par';
}

function shortName(name) {
    const parts = name.split(' ');
    return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
}

function formatThruLabel(thru) {
    if (thru === undefined || thru === null || thru === '--') return '';
    if (thru === 'F') return 'Finished';
    if (thru === 'MC') return '';
    if (typeof thru === 'number' || /^\d+$/.test(String(thru))) return `Thru ${thru}`;
    // Tee time string
    return `Tee ${thru}`;
}

function fmtRel(n) {
    if (n === 0) return 'E';
    return n > 0 ? `+${n}` : `${n}`;
}

function renderRoundBreakdownHtml(breakdown) {
    if (!breakdown || !breakdown.some(r => r.total !== null)) return '';
    return `
        <div class="round-breakdown" title="Team total score vs par by round">
            ${breakdown.map(r => `
                <div class="rb-round">
                    <span class="rb-label">R${r.round}</span>
                    <span class="rb-value ${r.total === null ? 'empty' : r.total < 0 ? 'under' : r.total > 0 ? 'over' : 'even'}">${r.total === null ? '–' : fmtRel(r.total)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

const scenarioAdjustments = new Map(); // competitorId -> stroke delta (-6 to +6)
const MAX_ADJUST = 6;

function renderScenariosModal() {
    const el = document.getElementById('scenarios-modal-body');
    if (!latestCompetitors) {
        el.innerHTML = '<p class="help-note">Waiting for tournament data…</p>';
        return;
    }

    const getScoreValue = (c) => {
        const s = c.score?.displayValue || c.score;
        if (s === 'E' || s === 'even' || s === 'even par') return 0;
        return parseInt(s?.toString().replace('+', '')) || 0;
    };

    const stillIn = latestCompetitors
        .filter(c => {
            const id = c.status?.type?.id;
            const disp = c.status?.displayValue || '';
            if (id === "3" || disp.includes("MC")) return false;
            if (cutInfo.hasOccurred && getScoreValue(c) > cutInfo.score) return false;
            return true;
        })
        .sort((a, b) => getScoreValue(a) - getScoreValue(b));

    const candidates = stillIn.slice(0, 20);

    if (candidates.length === 0) {
        el.innerHTML = '<p class="help-note">No candidates available.</p>';
        return;
    }

    const currentStandings = computeStandingsSnapshot(latestCompetitors);

    el.innerHTML = `
        <p class="scenarios-intro">Adjust any of the top 20 golfers' scores (up to ±${MAX_ADJUST} strokes) to see how each team's total would change. <strong>−</strong> = one stroke better, <strong>+</strong> = one stroke worse. Other golfers stay at their current scores.</p>
        <div id="scenario-standings" class="scenario-standings"></div>
        <div class="scenario-adjusters-header">
            <span>Top 20 in Contention</span>
            <button class="scenario-reset-btn" id="scenario-reset">Reset All</button>
        </div>
        <div id="scenario-adjusters" class="scenario-adjusters"></div>
    `;

    const rerender = () => {
        const simCompetitors = latestCompetitors.map(c => {
            const delta = scenarioAdjustments.get(c.id) || 0;
            if (delta === 0) return c;
            const base = getScoreValue(c);
            const ns = base + delta;
            return {
                ...c,
                score: { displayValue: ns === 0 ? 'E' : (ns > 0 ? `+${ns}` : `${ns}`) }
            };
        });
        renderStandings(simCompetitors, currentStandings);
        renderAdjusters(candidates, getScoreValue);
    };

    const renderStandings = (simCompetitors, baseStandings) => {
        const sim = computeStandingsSnapshot(simCompetitors);
        const sorted = [...sim].sort((a, b) => b.total - a.total);
        const anyChange = [...scenarioAdjustments.values()].some(v => v !== 0);

        document.getElementById('scenario-standings').innerHTML = `
            <table class="scenario-table">
                <thead><tr><th>Rank</th><th>Drafter</th><th>${anyChange ? 'Simulated' : 'Total'}</th>${anyChange ? '<th>Δ</th>' : ''}</tr></thead>
                <tbody>
                    ${sorted.map((row, i) => {
                        const base = baseStandings.find(c => c.drafter === row.drafter);
                        const delta = row.total - (base?.total || 0);
                        return `
                        <tr>
                            <td>${i + 1}</td>
                            <td><strong>${row.drafter}</strong></td>
                            <td class="sim-total">$${Math.round(row.total).toLocaleString()}</td>
                            ${anyChange ? `<td class="${delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : ''}">${delta === 0 ? '—' : (delta > 0 ? '+' : '–') + '$' + Math.abs(Math.round(delta)).toLocaleString()}</td>` : ''}
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
    };

    const thruByName = {};
    fullField.forEach(p => { thruByName[p.name] = p.thru; });

    const renderAdjusters = (list, getVal) => {
        document.getElementById('scenario-adjusters').innerHTML = list.map(c => {
            const name = c.athlete.displayName;
            const drafter = getDrafterForPlayer(name);
            const base = getVal(c);
            const delta = scenarioAdjustments.get(c.id) || 0;
            const simScore = base + delta;
            const formatted = simScore === 0 ? 'E' : (simScore > 0 ? `+${simScore}` : `${simScore}`);
            const baseFormatted = base === 0 ? 'E' : (base > 0 ? `+${base}` : `${base}`);
            const adjText = delta === 0 ? '' : `(${delta > 0 ? '+' : ''}${delta})`;
            const thru = thruByName[name];
            const thruLabel = formatThruLabel(thru);
            return `
                <div class="adjuster-row ${delta !== 0 ? 'adjusted' : ''}" data-id="${c.id}">
                    <div class="adjuster-name">
                        <span class="a-name">${shortName(name)}</span>
                        ${drafter ? `<span class="drafter-label">${drafter}</span>` : ''}
                        ${thruLabel ? `<span class="a-thru">${thruLabel}</span>` : ''}
                    </div>
                    <div class="adjuster-score">
                        <span class="a-base">${baseFormatted}</span>
                        <span class="a-arrow">→</span>
                        <span class="a-sim ${delta < 0 ? 'better' : delta > 0 ? 'worse' : ''}">${formatted}</span>
                        <span class="a-delta">${adjText}</span>
                    </div>
                    <div class="adjuster-controls">
                        <button class="adj-btn" data-act="better" aria-label="One stroke better">−</button>
                        <button class="adj-btn" data-act="worse" aria-label="One stroke worse">+</button>
                    </div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('#scenario-adjusters .adj-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const row = btn.closest('.adjuster-row');
                const id = row.dataset.id;
                const curr = scenarioAdjustments.get(id) || 0;
                const act = btn.dataset.act;
                // "+" = one stroke worse (adds to score); "−" = one stroke better (subtracts from score)
                const next = act === 'worse' ? curr + 1 : curr - 1;
                if (next < -MAX_ADJUST || next > MAX_ADJUST) return;
                scenarioAdjustments.set(id, next);
                rerender();
            };
        });
    };

    document.getElementById('scenario-reset').onclick = () => {
        scenarioAdjustments.clear();
        rerender();
    };

    rerender();
}

function computeStandingsSnapshot(competitors) {
    const { prizes } = calculatePrizesAndRanks(competitors);
    return Object.entries(draftData).map(([drafter, players]) => {
        const total = players.reduce((sum, name) => sum + (prizes[name] || 0), 0);
        return { drafter, total };
    });
}

init();