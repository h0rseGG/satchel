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
- Testing uses the demo character only until he says the app is finished. Still treat data safety as if it were real.

## Environment (Windows 11, PowerShell 5.1)
- Tools: Git, Node LTS, Python. If a freshly installed tool isn't found, reload PATH in the command:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User');`
- The `!` shell in Claude Code can't do interactive git sign-in: do the first `git push` from a normal terminal (Git Credential Manager opens the browser).
- Commit identity is repo-local: `h0rse` / `189693150+h0rseGG@users.noreply.github.com`. Never use a work email.
- Commit messages: write to a scratchpad file, `git commit -F <file>` (PS 5.1 mangles quotes). End with the attribution line the harness provides.
- Don't write repo files with `Set-Content`/`Out-File` (BOM). Use the Edit/Write tools or a node script file.
- Gate scripts: ASCII-only patterns (PS 5.1 misreads `ℹ` in BOM-less scripts).
- Bump `BUILD` in `js/version.js` on every push (date.counter); it shows in the menu.

## Run and test
- Serve: `python -m http.server 8000` → http://localhost:8000 (Firefox). Tests use port 8123.
- Unit: `npm test`. Browser: `npx playwright test` (Firefox, 4 workers; 8 overloads this PC).
- **Before every push:** unit + `npx playwright test --repeat-each=2`, and **commit/push in the same command only if all pass**.
- Flaky test = lead: read `test-results/**/error-context.md`.
- UI milestones: run `tools/screens.mjs`, read the screenshots back, fix visual problems before calling it done.
- Tests may read the database through `window.__satchel.db` (exposed on localhost only).
- htm drops whitespace containing a newline: keep sentences with `${}` on one line.

## Status
- v1 is preserved at git tag `v1-final` (reference only; v2 is a fresh build).
- v2: not started. Begin at SPEC milestone M0.
