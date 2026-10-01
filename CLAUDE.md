# Satchel: working notes for Claude

Player-side D&D character companion. Static PWA on GitHub Pages, data in IndexedDB, no backend.
**SPEC.md is the source of truth.** Design: sections 0–11; every decision since approval: section 12 (decision log).
Owner: Jake (electrician; Python-first, new to web). Personal project, not Cablewise work.

## Working style (owner's preferences)
- Blunt, concise, structured. AU English, metric. Flag anything unverified ([NV]). Don't invent.
- End every reply with a clear **Next step** (he works in short, interrupted bursts).
- Ask at most 3 questions at a time (AskUserQuestion). Explain key choices briefly.
- When he's away and says "keep going": build approved scope, decide details, **log decisions in SPEC §12**, test, push each finished step.
- Authorised: push to `origin main` after each finished, tested step (it updates the live site).

## Environment quirks (Windows, PowerShell 5.1)
- Prefix shell commands with:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User');`
- Commit messages: write to the scratchpad and `git commit -F <file>` (PS 5.1 mangles quotes).
- Don't edit repo files with `Set-Content`/`Out-File` (BOM). Use the Edit tool, or a node script file for bulk edits.
- htm drops whitespace that contains a newline: keep sentences with `${}` on one line.
- Bump `BUILD` in `js/version.js` on every push (date.counter); it's shown in the top bar.

## Run and test
- Serve: `python -m http.server 8000`, then open http://localhost:8000 (Firefox).
- Unit: `npm test` (node --test, pure modules only). Browser: `npm run e2e` (Playwright, Firefox, 4 workers).
- Before pushing a step: unit tests plus the full browser suite, ideally `npx playwright test --repeat-each=2` (it has caught races).
- Tests use `window.__satchel.db` (localhost only) and `tests/fake-github.js` (in-memory GitHub).
- New characters land **out of session** (dashboard). Capture-screen tests call `enterSession(page)` from `tests/e2e/helpers.js`.
- Keep `tests/fixtures/schema-<n>.kit` for every kit schema version, forever.

## Code map
| File | Role |
|---|---|
| `js/model.js` | Record factories (entity, note, file, session, relationship), SCHEMA_VERSION (kit, now 2), PROFILE_SECTIONS |
| `js/mentions.js` | @mention parsing; tokens `@[label](id)`; resolveMentions; linkPlainName |
| `js/search.js` | MiniSearch index, recall-card matching |
| `js/kit.js` | Pack/unpack `.kit` (zip): kitFiles/readKitFiles, canonical JSON, MIGRATIONS |
| `js/merge.js` | Union by id (newest wins), duplicate-stub combining, mergeEntityInto, redirects |
| `js/fileRules.js`, `js/upload.js` | File rules (images, .txt, .md; 10 MB) and upload processing (WebP) |
| `js/backup.js`, `js/session.js` | Backup-badge rules; In/Out auto-end |
| `js/github.js`, `js/syncCore.js`, `js/sync.js` | GitHub client, pull/push engine, Sync now |
| `js/db.js` | Dexie schema (local db v4) and all reads/writes. Change counters via `save()` |
| `js/ui/App.js` | Shared top bar, messages, session toggle; picks CaptureScreen (in) or OutScreen (out) |
| `js/ui/CaptureScreen.js` | In-session front layer: feed, recall cards, capture box |
| `js/ui/OutScreen.js` + `js/ui/pages/*` | Hash-routed back layer: Dashboard, EntityList, Entity, Character, Inbox, Files, Log |
| `js/ui/fields.js`, `js/ui/files.js` | Autosave fields, chips, confirm dialog; file thumbs, viewer helpers, uploads |
| `js/ui/NoteItem.js`, `js/ui/Relationships.js` | Note row with edit/delete (Log, Inbox); relationships list, add form, sentence text |
| `sw.js` | Service worker: network-first, offline fallback |

## Status (2026-10-01)
- Week one: done. Week 2: sync (GitHub, merge-based) done. Out-of-session design (SPEC §7) steps 1–5 done.
- Also done: All notes page (#/log) with note edit/delete; relationships (entity/character pages, recall cards, Inbox "Add as relationship").
- Also done: per-section profile merge; visual review via `node tests/tools/screens.mjs <dir>` (needs `python -m http.server 8123` running), screenshots read back with the Read tool.
- Also done: per-entity connections diagram (`js/ui/Connections.js`, inline SVG).
- Demo character: `demo/wren.kit` (rebuild with `node tests/tools/make-demo-kit.mjs`; keep `tests/e2e/demo.spec.js` counts in step). Screenshots of it: `node tests/tools/screens.mjs <dir> demo/wren.kit`.
- Deferred: whole-campaign network graph (judge with real data first); private-window warning (Firefox gives no reliable way to detect it).
- Unverified on the Pixel: photo upload orientation; feel of the new pages on the phone.
