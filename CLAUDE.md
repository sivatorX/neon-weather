# Weather App: project guide for Claude

## What this project is
A weather web app. You type a city and see the current weather, the next hours and a 7-day forecast, with nice icons.
It is the author's **second project** ("level 2"). The first was a Battleship game: https://github.com/sivatorX/neon-armada

**Main learning goal:** working with **APIs**, meaning getting data from the internet.
New skills for this project: `fetch`, `async/await`, JSON, loading states, error handling, reading API docs.

## About the author (important)
- A beginner who wants to become a professional developer. **Teach, don't just code.**
- **Always answer in Russian.** Use simple words, short sentences and real-life examples. Code and names stay in English.
- When you introduce a new idea (API, `async`, `await`, `try/catch`, JSON), explain it in 1–3 simple sentences the first time.
- The author can choose the mode:
  - "I'll do it myself": give one small step at a time with exact placement (line number + text to search for), then check their work.
  - "Do it yourself": write the code, test it, then explain what changed in plain words.
- They edit in **Cursor**. If they have unsaved changes (● on the tab), saving can overwrite your edits on disk. Mention this only when it really matters.

## Tech choices (keep it simple)
- **Plain HTML + CSS + JavaScript.** No frameworks and no build step. Start with one `index.html`; split into `style.css` and `app.js` when it grows (that split is itself a lesson).
- **Weather data: [Open-Meteo](https://open-meteo.com/).** It is free and needs **no API key**, so there is no secret to leak on GitHub Pages.
  - Forecast: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=...&hourly=...&daily=...&timezone=auto`
  - City search (geocoding): `https://geocoding-api.open-meteo.com/v1/search?name=<city>&count=5&language=ru`
  - Weather codes (WMO `weather_code`) must be mapped to an icon and a text.
- **Roadmap** (one step = one commit):
  1. ✅ Page layout (static).
  2. ✅ Real data: city search + current weather; split into `style.css` and `app.js`.
  3. ✅ Next hours + 7-day forecast.
  4. ✅ Live background: changes with weather and day/night (sun, rain drops, snow, stars).
  5. ✅ Assistant panel: what to wear, best time for a walk, compare with yesterday, read aloud (`insights.js`).
  6. ✅ "My location" button + favourite cities (`localStorage`).
  7. 24-hour temperature chart, sunrise/sunset, air quality (`https://air-quality-api.open-meteo.com/v1/air-quality`, no key).
  8. Publish on GitHub Pages.
- Optional later: "use my location" (`navigator.geolocation`), °C/°F switch, saved favourite cities (`localStorage`), a temperature chart.
- Never put secret API keys in this repo. A service that needs a key needs a small server; that is a level 3 topic.

## Code style
- 2-space indent, `const`/`let`, no `var`. Use clear English names (`fetchForecast`, `renderToday`).
- Short comments that explain **why**, in simple English, so a beginner can read them.
- Every network call must handle three states: **loading**, **success** and **error** (no internet, city not found). Show a friendly message for each.
- Check data you did not create (API answers, `localStorage`) before using it.
- It must work on phones (16px side gutter, no sideways scrolling) and support dark mode.

## Workflow
- Build in small steps: a working simple version first, then improve.
- **git:** commit after each finished step with a clear message (`Add 7-day forecast`).
  - The author knows `git add`, `git commit` and `git push`; teach new commands when they come up.
  - Before committing, check that nothing unrelated is staged.
- **GitHub:** the repo will be `sivatorX/<name>` with GitHub Pages from `main` / root. A push updates the site within about 1 minute.
  - GitHub CLI is installed but **not on PATH**: `/c/Users/armin/AppData/Local/Microsoft/WinGet/Packages/GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe/bin/gh.exe` (logged in as sivatorX).
- After a bigger change, the `code-improver` agent can review the code; verify each finding before fixing it.

## Project agents (`.claude/agents/`)
Delegate to these to work faster. Check what they report before trusting it.
- `api-researcher`: before writing API code; returns exact Open-Meteo URLs, field names and edge cases.
- `coder`: writes the code for one small step ("Do it yourself" mode). Does not commit.
- `code-improver`: after a change; reviews the code and suggests improvements. Read-only, never edits.
- `tester`: after a change; tests in headless Edge (loading/success/error, phone width, dark mode). Reports only, never fixes.
- `git-helper`: after a step is finished and tested; commits (and pushes when asked).

## Testing on this machine (Windows)
- There is **no Node.js and no Python**. Test with headless Edge:
  `msedge --headless=new --virtual-time-budget=5000 --dump-dom <file-or-url>`.
  - Add a small probe `<script>` that writes results into `document.body.dataset`.
  - Use `--screenshot=<png>` to look at the page.
  - For real network calls (the API), use real time instead of `--virtual-time-budget`.
- `git` works only in **bash**, not in PowerShell.
- Windows PowerShell 5.1 reads `.ps1` files without a BOM as ANSI, which breaks `…`, `·` and emoji. Save scripts as UTF-8 **with BOM** or keep them ASCII-only.
- Always say what you checked before saying something works.
