# Satchel v3: kickoff brief for Claude Code

Read this first. It replaces v2's SPEC.md and CLAUDE.md. Full plan (Jake's copy, not readable from this session): https://claude.ai/code/artifact/dddd9f2a-d259-405e-85dc-532fe4692844. Where they differ, this brief wins.

## Product
Player's companion for one D&D character. Two moments: fast capture at the table, optional tidy-up afterwards. No stats, dice, accounts or server. Windows 11 only, single user (Jake).

## Decisions (approved)
- Native desktop app: Python + PySide6 (Qt 6 **Widgets**, not QML). uv for env/run, ruff, pytest + pytest-qt + Hypothesis.
- Python: the newest version current PySide6 supports; check at P0 [NV], pin it in `pyproject.toml` and `.python-version`.
- One SQLite file per character (`<character>.satchel`), stdlib `sqlite3`, FTS5 search, numbered SQL migrations via `PRAGMA user_version`. No ORM. Images (Pillow, WebP) stored as BLOBs in the same file.
- Live DB in `%LOCALAPPDATA%\Satchel` (one file per character). **No automatic snapshots or sync.** Backups and moving between machines are manual, via kits:
  - **Pack kit** exports one character to `<character>-YYYY-MM-DD-HHmm.kit`: a zip holding `manifest.json` (format "satchel", schema_version, character_id, character name, exported_at, app version) and a consistent copy of the database made with `VACUUM INTO`. Where the file goes is up to Jake.
  - **Unpack kit** validates first (valid zip, manifest present, `PRAGMA integrity_check` ok; newer schema refused; older schema migrated) and then offers **Add as new character** or, for the same character_id, **Replace**. Replace needs a confirm, warns if the local copy has edits newer than the kit's `exported_at`, and keeps the old file in a local `replaced/` folder.
  - **End-of-session nudge:** ending a session with changes since the last Pack kit shows a non-blocking prompt, "Session over. Pack your kit before you go?" with **Pack kit** and **Not now**. It isn't a confirm dialog and never blocks closing. Track `last_packed_at` locally; no badge.
  - No merge. v2 `.kit` files aren't supported (different format, no real v2 data).
  - Mostly one machine (the Framework laptop); a second machine just unpacks a kit.
- Names auto-link: known names, aliases and short names are matched as you type (no `@` needed). `@` only for new names or disambiguation. Unknown names become *candidates* for Review, not instant stubs.
- Note storage keeps v2's inline token format `@[label](id)`; a derived `note_links` table (note, entity, how: typed/auto/confirmed).
- Sessions are records (number, date, title, recap). No global in/out mode, no auto-end.
- Review replaces Inbox. Entity pages show backlinks (every note mentioning them) and pinned notes. Notes are never copied into descriptions.
- Built-in Thread type (open/closed) for quests, debts, mysteries.
- Global hotkey quick capture (Win32 `RegisterHotKey` via ctypes + `QAbstractNativeEventFilter`), tray icon, Ctrl+K palette.
- Dropped from v2: merge, tombstones, backup badge, automatic backups, service worker, CSP, phone/browser workarounds, GitHub Pages.
- Look: v2's **field journal** style (port SPEC s5.4 from `v2-final`). Palette, only these: paper #F6F1E4, paper-alt #EDE5D2, rule #D8CDB6, ink #3B3026, ink-muted #736452, red #9C4A3A, green #4F6B47, wash-ok #DCE5D3, wash-warn #EED9AE, wash-err #E9C9BF, highlight #E2D3B0. Headings in IM Fell English / IM Fell English SC (copy the woff2 files + OFL from `v2-final:vendor/fonts/`, load with `QFontDatabase.addApplicationFont`; [NV] Qt on Windows may not load woff2, so convert to TTF with fontTools if it fails); body, notes and inputs in Segoe UI Variable; numbers never in the serif. Radius 3 px, ruled row lines, red margin line. One QSS file. Never invent other colours.

## Reference from v2 (read-only, via git)
- `git show v2-final:SPEC.md`: port **section 4** (typing rules) and **section 13** (lessons) word for word into the v3 SPEC. Ignore browser-specific lessons.
- `git show v2-final:tools/demo-data.mjs` and `v2-final:demo/wren.kit`: the messy demo character. Port it as a Python fixture (read the data from demo-data.mjs; there is no kit importer).
- `git show v2-final:js/core/mentions.js`, `shortnames.js`, `tags.js`, `text.js`: reference behaviour for the port. Tests decide correctness, not the JS.
- `git show v2-final:tests/unit/mentions.test.js`: turn every case into a pytest case.

## Phases
| Phase | Scope | Gate (done when) |
|---|---|---|
| **P0 Foundations (this session)** | Repo skeleton (uv project, `src/satchel/core`, `src/satchel/db`, `tests/`), v3 SPEC.md + CLAUDE.md, core rules (mentions, short names, tags, auto-link matcher) as pure Python, SQLite schema + migrations, demo fixture. No v2 importer (no real v2 data exists). **No UI.** | G0: every SPEC s4 rule passes as pytest; Hypothesis fuzzes the parser; the demo fixture loads with the expected counts (47 notes, 23 entities, 4 stubs as candidates, 12 unreviewed); matcher < 10 ms per keystroke at 5000 notes / 300 entities |
| P1 Table MVP (on Windows) | Main window, Table view, capture bar, live highlighting + autocomplete, recall panel, sessions, tray + hotkey, Pack/Unpack kit + end-of-session nudge | G1: one real session, no lost notes, save < 50 ms |
| P2 Desk | Review, backlink entity pages, types/fields/threads, relationships + graph, files, palette | G2: review < 2 min per session |
| P3 Optional | Markdown export, phone drop-folder, local-LLM recap, single .exe | Only if G2 shows a need |

## Working rules
- Blunt, concise, AU English, metric. Challenge weak ideas. Flag unverified claims as [NV]; never invent library behaviour.
- Jake is Python-first and wants to understand the code: comments low-to-medium detail for an active learner; snake_case functions/variables, PascalCase classes.
- End every reply with a **Next step**. Ask at most 3 questions at a time; recommend an option.
- Core (`satchel.core`) is pure: no Qt, no sqlite. Only `satchel.db` touches the database.
- Gate every commit: `uv run ruff check && uv run pytest && git commit ... && git push` (chained with `&&`).
- Commit identity is repo-local: `h0rse` / `189693150+h0rseGG@users.noreply.github.com`. Never a work email.
- Tests use fixtures and the demo only.
- Log decisions in the v3 SPEC decision log with the date.
- Stop at G0 and report. Don't start P1 on the Ubuntu server: hotkey, tray and the real UI need Windows.
