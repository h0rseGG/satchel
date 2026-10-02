# G1 checklist (P1 gate)

**Gate (SPEC 12):** one real session, no lost notes.

## Before the session

1. In `C:\Users\h0rse\playground\satchel`: `git pull`, then `uv sync`.
2. Gate check: `uv run ruff check && uv run pytest` (all green).
3. Start Satchel: `uv run satchel` (windowed). Use `uv run python -m satchel` if you want a console for errors.
4. First run: **New character**, or **Unpack kit** if you have one.

## Windows checks (the tests can't see these)

- [ ] The tray icon appears. Clicking it opens Satchel, and right-clicking shows Open / Quick capture / Pack kit / Quit.
- [ ] **Ctrl+Alt+N from another app** (browser, D&D Beyond) opens Quick capture **with the cursor already in the box**. [NV] Windows can refuse focus to a background app; if you have to click before typing, note it.
- [ ] Quick capture: Enter saves and closes. Esc closes and keeps the text for next time.
- [ ] Closing the main window hides it to the tray (one notice). Ctrl+Alt+N still works. File › Quit ends Satchel.
- [ ] Headings are in IM Fell, numbers are in Segoe ("Session 5": the 5 isn't serif), and it's light even if Windows is in dark mode.

## During the session

- [ ] **Start session**, add a title if you like.
- [ ] Type as you normally would, and keep a tally of notes typed (pen and paper).
- [ ] Use `@` for new names, Tab to pick, `#tags`, and **Link** / **Set type** on recall cards when they help.
- [ ] Click a note to fix a typo (Enter saves, Esc cancels).

## After the session

- [ ] **End session**. The nudge bar should offer **Pack kit**: pack to somewhere off the laptop (USB or OneDrive).
- [ ] **No lost notes:** the feed's note count equals your tally.
- [ ] **Errors:** open `%LOCALAPPDATA%\Satchel\satchel.log`. `ERROR` / `CRITICAL` lines are bugs: copy them to Claude. (Each `save … ms` line is one note and its save time, for information only.)
  - The log holds ids and times only, never note text.

## Report back

Tally vs notes saved, any errors in the log, anything confusing or wrong, and the focus result from the Ctrl+Alt+N check.

**Not in P1** (so not a G1 failure): deleting notes, entity pages, Review, moving notes between sessions. All P2.
