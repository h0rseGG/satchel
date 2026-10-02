# Satchel v3: working notes for Claude

Player-side D&D character companion. Native Windows 11 desktop app: Python + PySide6 (Qt Widgets), one SQLite file per character, no server, no sync. Repo: github.com/h0rseGG/satchel.
**SPEC.md is the source of truth (approved 2026-10-02).** Read section 13 (lessons) before coding. Log every build decision in SPEC section 15 with the date.
Owner: Jake. Electrician, Python-first. Personal project (not Cablewise work). He wants to understand the code.

## Working style
- Blunt, concise, structured. Challenge weak ideas. AU English, metric.
- Flag anything unverified as [NV]; never invent library behaviour.
- End every reply with a **Next step**. Ask at most 3 questions at a time; recommend an option.
- Code for an active learner: comments at low-to-medium detail explaining *why*; snake_case functions/variables, PascalCase classes; plain, conventional Python (type hints, dataclasses, no clever metaprogramming).
- When he's away: build approved scope step by step, decide details, log them, test, commit. Don't expand scope; leave design-changing questions for his return.

## Rules
- `satchel.core` is pure: no Qt, no sqlite, no file I/O. Only `satchel.db` touches the database.
- Tests use fixtures and the demo only, never Jake's data.
- Treat any `.satchel` file on his machines as real data: schema changes only via new numbered migrations; never edit a shipped one.
- Colours: only the SPEC 5.3 palette. Fonts: IM Fell for headings, Segoe UI Variable for the rest, numbers never in the serif.
- UI, tray and hotkey work (P1+) is built and tested on Windows only.

## Environment
- Build, test and target machine: Windows 11 (Framework laptop), repo at `C:\Users\h0rse\playground\satchel`. The old Ubuntu build machine (P0) is retired for this project.
- Shell: the commit gate needs `&&`, which works in Git Bash (Claude Code's shell on Windows) and PowerShell 7+, but **not** Windows PowerShell 5.1. In 5.1, run the steps one at a time and stop on the first failure.
- Line endings: `.gitattributes` keeps LF in the repo; don't change `core.autocrlf` per machine to work around it.
- Paths in code: always `pathlib`; never hard-code `\` or `/`. Live data goes under `%LOCALAPPDATA%\Satchel` (SPEC 2); tests only ever use `tmp_path`.
- `uv` manages Python (pinned in `.python-version`) and dependencies. `uv sync` after pulling.
- Commit identity is repo-local: `h0rse` / `189693150+h0rseGG@users.noreply.github.com`. Never a work email.
- Commit messages via heredoc or `git commit -F <file>`; end with the attribution line the harness provides.

## Run and test
- Lint: `uv run ruff check`. Format: `uv run ruff format`.
- Tests: `uv run pytest` (includes Hypothesis property tests and the perf checks). Deeper fuzzing: `HYPOTHESIS_PROFILE=deep uv run pytest tests/test_properties.py tests/test_search.py`.
- **Gate every commit** in one chain so a failure stops it: `uv run ruff check && uv run pytest && git commit -F msg.txt && git push`. Never chain with `;`, and never pipe pytest (`| tail`) inside the chain: the pipe's exit code hides a failure.
- Rebuild nothing by hand: the demo database is built by the test fixture (`tests/fixtures/demo.py`).

## Status
- v1 at tag `v1-final`, v2 at tag `v2-final` (reference: `git show v2-final:<path>`).
- v3: **P0 done** (gate G0 passed 2026-10-02; Windows-verified: tests pass, SQLite 3.53.1 with FTS5 + STRICT, Qt loads the TTF fonts).
- **P1 Table MVP built** (SPEC 12, tasks 1–11 done 2026-10-03; decisions in SPEC 15): main window, Table view (session strip, feed, capture box with highlighting + autocomplete, recall panel), Quick capture + tray + Ctrl+Alt+N, Pack/Unpack kit + nudge, `satchel.log`. UI code is in `src/satchel/ui/` (one component per job; `CharacterStore` is the only owner of the connection).
- **Next: G1** (Jake plays one real session; no lost notes). Follow `docs/G1-CHECKLIST.md`. Don't start P2 until G1 passes; then start from `docs/P2-KICKOFF.md` (reading list, decisions D1–D9 to ask Jake, migration 0002, build order).
- Open for P2 (don't solve in P1 unless needed): a Review-dismissed auto link comes back when the note is edited; renaming an entity leaves old labels in note search rows until the note is re-saved; whether reviewing a note confirms its links; the nudge doesn't see meta edits or deletes (no timestamps).
