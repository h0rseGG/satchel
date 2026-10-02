# Satchel

A notebook for one D&D character, from the player's side of the table.

D&D Beyond already handles the stats and the dice. What it doesn't handle is the stuff you scribble during a session: the dwarf you owe 20gp, the name the barkeep let slip, the fact that Vex is apparently Aldric's sister. That's what Satchel is for.

It's a small Windows desktop app. One box, you type, you press Enter, the note is saved. Names you've used before link themselves as you type, so "paid grimbold back" ends up connected to Grimbold Ironhand without you doing anything. Later on (or never, that's fine too) you can tidy up.

## What it does right now

This is v3. The first two versions were web apps, and they taught me a lot about what not to do. v3 is a native app with one SQLite file per character and no server, accounts or sync.

The table side (phase P1) is built:

- A capture box that highlights names and tags while you type. `@` for a new name, `#` for a tag, Tab to pick a suggestion.
- A notes feed for the current session, newest at the bottom. Click a note to fix a typo.
- Recall cards on the right showing who someone is, how they're connected and the last few times they came up.
- Sessions you start and end, with a title if you want one.
- Quick capture: Ctrl+Alt+N from anywhere (D&D Beyond, Discord, whatever) pops up a box, you type, Enter, gone.
- A tray icon, so closing the window doesn't stop the hotkey.
- Kits for backup and moving between computers. A kit is a zip of the character file, and there's a nudge to pack one when a session ends.

Still to come (P2): a Review page for tidying a session's notes, pages for each person and place, relationships, files and maps.

The P1 gate hasn't been run yet. It's one real session with no lost notes.

## Running it

You need Windows 11 and [uv](https://docs.astral.sh/uv/). uv sorts out Python 3.14 and everything else.

```
git clone https://github.com/h0rseGG/satchel.git
cd satchel
uv sync
uv run satchel
```

`uv run python -m satchel` does the same with a console window, which is handy if something breaks.

## Where your stuff lives

- Characters: `%LOCALAPPDATA%\Satchel\<name>.satchel`. Keep this folder out of OneDrive or any other sync tool. A sync app poking at a live database is how files get damaged.
- Backups: wherever you save your kits (Pack kit in the File menu or the tray). Put them somewhere off the machine.
- Log: `%LOCALAPPDATA%\Satchel\satchel.log`. Save times and errors only. Note text never goes in there.

Nothing is backed up automatically. Packing a kit takes a few seconds, so do it after each session.

## Working on it

```
uv run ruff check && uv run pytest
```

That's the gate for every commit. The tests build a demo character (Wren Ashdown, a month of messy Friday-night notes) and run it through the real save path. That demo has caught more bugs than anything else.

`SPEC.md` is the source of truth: what the app does, how names link, the colours, and a log of every decision with the date. If you're going to change something, start there. `CLAUDE.md` holds the working notes for Claude, which helped build this.

The code is split three ways. `satchel.core` holds the rules (pure Python, no Qt, no database), `satchel.db` is the only thing that touches SQLite, and `satchel.ui` is the Qt Widgets app.

## Fonts

Headings use IM Fell English, which is under the SIL Open Font License (`src/satchel/ui/fonts/OFL.txt`). Everything else is Segoe UI Variable, which ships with Windows 11.
