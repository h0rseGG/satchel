# Satchel v3: working notes for Claude

Player-side D&D character companion. Native Windows 11 desktop app: Python + PySide6 (Qt Widgets), one SQLite file per character, no server, no sync. Repo: github.com/h0rseGG/satchel.
**SPEC.md is the source of truth.** Read section 13 (lessons) before coding. Log every build decision in SPEC section 15 with the date.
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
- Don't start P1 (UI, tray, hotkey) on the Ubuntu machine; those need Windows.

## Environment
- Build/test machine: Ubuntu. Target: Windows 11 (Framework laptop).
- `uv` manages Python (pinned in `.python-version`) and dependencies. `uv sync` after pulling.
- Commit identity is repo-local: `h0rse` / `189693150+h0rseGG@users.noreply.github.com`. Never a work email.
- Commit messages via heredoc or `git commit -F <file>`; end with the attribution line the harness provides.

## Run and test
- Lint: `uv run ruff check`. Format: `uv run ruff format`.
- Tests: `uv run pytest` (includes Hypothesis property tests and the perf check).
- **Gate every commit** in one chain so a failure stops it: `uv run ruff check && uv run pytest && git commit -F msg.txt && git push`. Never chain with `;`.
- Rebuild nothing by hand: the demo database is built by the test fixture (`tests/fixtures/demo.py`).

## Status
- v1 at tag `v1-final`, v2 at tag `v2-final` (reference: `git show v2-final:<path>`).
- v3: P0 (foundations) in progress.
