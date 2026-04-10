# AGENTS.md

This repository contains a real-time leaderboard for the 2026 Masters Tournament pool, designed for GitHub Pages.

## Project Overview
- **Type:** Static Web Application (HTML/CSS/JS)
- **Data Source:** ESPN PGA API (`https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard`)
- **Key Logic:** Fetches live tournament data, maps it to pool participants' teams, and calculates projected winnings based on Augusta-style tie-splitting rules.

## Core Files
- `index.html`: Main entry point and layout.
- `style.css`: Custom styling (Vanilla CSS, mobile-first).
- `app.js`: Application logic, including draft data, prize calculations, and UI updates.
- `masters-2026-strategy.md`: Documentation of the draft strategy and pool history.

## Technical Patterns
- **State Management:** Simple `Set` (`expandedTeams`) to track UI state.
- **Data Structure:** `draftData` in `app.js` contains participant names and their selected players.
- **Prize Calculation:** `prizeTable` contains the payout structure. The logic must handle ties by splitting prizes according to standard PGA/Augusta rules.

## Development Commands
- **Serve Locally:** Use any static file server (e.g., `python -m http.server` or `npx serve .`).
- **Testing:** No automated testing framework is currently implemented. Manual verification of API responses and prize calculations is required.

## Boundaries & Constraints
- **No Backend:** Do not introduce Node.js or server-side dependencies.
- **Vanilla Only:** Maintain the use of Vanilla JS and CSS. Avoid adding large frameworks or libraries.
- **Credential Safety:** Never add API keys or secrets. The ESPN API used is public.
- **Data Integrity:** `draftData` is the source of truth for pool teams. Do not modify participant picks without explicit instructions.
