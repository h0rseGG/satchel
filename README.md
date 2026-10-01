# Satchel

A notebook for your D&D character. Type notes during a session, @mention people and places, and find them again fast. Tidy up later, or don't.

- No stats or mechanics. D&D Beyond does that.
- Your data lives in your browser. No accounts, no server.
- Pack your kit into a single `.kit` file and unpack it on another device.

**Use it:** https://h0rsegg.github.io/satchel/

> Clearing your browser's site data deletes your data. Pack your kit regularly as a backup.

## Try it with a demo character
On the first screen, tap **Try the demo character**. You get Wren Ashdown, an exiled ranger a month into a campaign: notes from four sessions, a dozen NPCs and places, relationships, a map and a handout, plus a few things left untidy so you can try the Inbox and merging.

Use a private window if you already have a character, because unpacking a different one replaces it. You can also download the kit itself: [demo/wren.kit](https://h0rsegg.github.io/satchel/demo/wren.kit). To rebuild it, run `node tests/tools/make-demo-kit.mjs`.

## Status
Early development. The design and roadmap are in [SPEC.md](SPEC.md).

## Run locally
You need Python (any recent version). From this folder:

```
python -m http.server 8000
```

Then open http://localhost:8000 in Firefox. Opening `index.html` straight from disk won't work, because the app needs a secure context (`localhost` or HTTPS).

## Project layout
| Path | What |
|---|---|
| `index.html` | The page, plus the import map that points library names at `vendor/` |
| `css/app.css` | Styles; the palette is defined as CSS variables at the top |
| `js/` | App code (plain ES modules, no build step) |
| `vendor/` | Pinned third-party libraries: Preact, HTM, Dexie, MiniSearch, fflate |
| `tests/` | Unit tests (`node --test`) and browser tests (Playwright) |

## Licence
No licence: all rights reserved. Using the hosted app is fine.