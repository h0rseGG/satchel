# Satchel v2: working notes for Claude

Player-side D&D character companion. Static PWA on GitHub Pages (github.com/h0rseGG/satchel, live at https://h0rsegg.github.io/satchel/), data in IndexedDB, no backend, no sync.
**SPEC.md is the source of truth.** Read section 13 (lessons from v1) before coding. Log every build decision in SPEC section 15 with the date.
Owner: Jake. Electrician, Python-first, new to web. Personal project (not Cablewise work). He mostly reviews behaviour, not code.

## Working style
- Blunt, concise, structured. Challenge weak ideas. AU English, metric.
- Flag anything unverified as [NV]; never invent library behaviour or browser limits.
- End every reply with a clear **Next step**: he works in short, interrupted bursts.
- Ask at most 3 questions at a time (AskUserQuestion); recommend an option.
- Explain key choices briefly. Make reasonable assumptions and say so inline.
- When he says "keep going" / is away: build approved scope milestone by milestone, decide details, log them, test, push each finished step. Don't expand scope; leave design-changing questions for his return.
- Authorised: push to `origin main` after each finished, **tested** step (it updates the live site).
- **Finished concept (Jake, 2026-10-02).** Not yet his official record, but treat any data on his devices as real: a change must never risk existing data (database upgrades, kit schema, merges, imports). Database changes go through new Dexie versions with upgrades; a kit schema change gets a migration and a new frozen fixture. Tests still use the demo and fixtures, never his data.
- `tools/screens.mjs` seeds its own data per screen; extend its SCREENS list when adding a screen.

## Environment (Ubuntu build machine; the app targets Firefox on Windows and Android)
- Tools:
  - `git`;
  - Node **LTS via nvm** (Ubuntu's apt `nodejs` is often too old);
  - `python3`, already installed.
  - Playwright Firefox: `npx playwright install --with-deps firefox` (needs sudo once for system libraries).
- GitHub sign-in: `gh auth login` (GitHub CLI) or an SSH key. Interactive prompts can't run inside Claude Code's shell, so Jake does the first sign-in in a normal terminal.
- Commit identity is repo-local: `h0rse` / `189693150+h0rseGG@users.noreply.github.com`. Never use a work email.
- Commit messages: a heredoc or `git commit -F <file>`; end with the attribution line the harness provides.
- Bump `VERSION` in `js/version.js` on every push (`2.N`: 2.1, 2.2, ...); it shows in the menu as "Satchel v2.N".
- Manual checks: Playwright covers Firefox on Linux. At each milestone Jake also opens the live site in Firefox on Windows and on his Pixel (the real targets).
- v1 was built on Windows/PowerShell; its PowerShell workarounds don't apply here.

## Run and test
- Serve: `python3 -m http.server 8000` → http://localhost:8000 (Firefox). Tests use port 8123 (the Playwright config starts `python3 -m http.server 8123`).
- Unit: `npm test`. Browser: `npx playwright test` (Firefox, 4 workers; 8 overloads this PC).
- **Before every push:** unit + `npx playwright test --repeat-each=2` + `npm run speed` (the 5000-note speed check, run alone), and **commit/push in the same command only if all pass**, e.g. `npm test && npx playwright test --repeat-each=2 && npm run speed && git commit -F msg.txt && git push` (`&&` stops at the first failure). Never chain the push after tests with `;`.
- **After adding or removing app files:** `node tools/sw-files.mjs` (the service worker's pre-cache list; a unit test fails if it's stale). After editing the import map: `node tools/csp-hash.mjs`.
- **After every push:** `node tools/check-live.mjs` (waits for Pages, opens the live site in Firefox, checks the version and no errors). Local tests can't see files that never got committed.
- Flaky test = lead: read `test-results/**/error-context.md`.
- UI milestones: run `tools/screens.mjs`, read the screenshots back, fix visual problems before calling it done.
- Tests may read the database through `window.__satchel.db` (exposed on localhost only).
- htm drops whitespace containing a newline: keep sentences with `${}` on one line.

## Status
- v1 is preserved at git tag `v1-final` (reference only; v2 is a fresh build).
- v2: M0–M3 done (… plus the session screen: capture, autocomplete, recall, tap-to-link, quick type, overview, auto-end). M4 done (World: types, fields, type lists, entity page, merge, delete). M5 done (Notes, Inbox and every sort action). M6 done (character page, portraits, D&D Beyond link). M7 done (relationships, diagram). M8 done (files grid, viewer, attach, pictures). M9 done (kits: pack, unpack New/Merge/Replace, nudge, persistence, first run with demo, Help, Settings). M10 done: released as v2.12 (speed at 5000 notes, error toasts, accessibility audit, README). Further work is Jake's call; he's using it at the table to find friction.
