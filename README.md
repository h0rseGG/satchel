# Satchel

A player-side D&D character companion. Type notes during a session, @mention people and places, and get instant recall. Tidy it all up later, or never.

- **No stats or mechanics.** D&D Beyond handles those.
- **Local-first.** Your data lives in your browser. There are no accounts and no server.
- **Portable.** Export and import a single `.satchel` file.

**Use it:** https://h0rsegg.github.io/satchel/

> Your data stays in the browser you use it in. Export a backup regularly: clearing site data in your browser deletes it.

## Status
Early development. See [SPEC.md](SPEC.md) for the full design, decisions and roadmap.

## Run locally
Needs Python (any recent version). From this folder:

```
python -m http.server 8000
```

Then open http://localhost:8000 in Firefox. Opening `index.html` directly from disk will not work, because the app needs a secure context (`localhost` or HTTPS).

## Project layout
| Path | What |
|---|---|
| `index.html` | The page, plus the import map that points library names at `vendor/` |
| `css/app.css` | Styles; the palette is defined as CSS variables at the top |
| `js/` | App code (plain ES modules, no build step) |
| `vendor/` | Pinned third-party libraries: Preact, HTM, Dexie, MiniSearch, fflate |
| `tests/` | Unit tests (`node --test`) and browser tests (Playwright) |

## Licence
No licence: all rights reserved. You're welcome to use the hosted app.
