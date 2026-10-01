# Satchel

A player's companion for one D&D character: jot notes fast at the table, tidy them up afterwards.

**Use it:** https://h0rsegg.github.io/satchel/ (Firefox on Windows or Android; nothing to install).

- **At the table:** Start session, type, press Enter. `@` mentions someone (`@Lord_Aldric` for two words), `#` adds a tag. Names you've met pop up as cards while you type.
- **Afterwards:** sort the Inbox into people's pages, your character or relationships; build up the World with your own types and fields; keep maps and handouts in Files.
- **No stats or dice** (D&D Beyond does those), **no accounts, no server.** Everything stays in this browser on this device.

## Backups and other devices

Pack kit (or tap the badge in the top bar) downloads a `.kit` file: a zip with your character, notes and files. To move to another device, pack a kit, move the file (Drive, USB, email) and Unpack kit there, then choose **Merge**. The badge shows how much has changed since the last kit.

Private windows wipe their data when closed. Pack kits often.

## Development

No build step: the app is plain ES modules with pinned libraries in `vendor/`. Ubuntu with Node LTS (nvm), python3 and Playwright Firefox.

```sh
npm install
npx playwright install --with-deps firefox   # once; needs sudo for system libraries
python3 -m http.server 8000                  # http://localhost:8000
npm test                                     # unit tests (node --test)
npx playwright test                          # browser tests, Firefox, 4 workers
npm run speed                                # the 5000-note speed check, run alone
```

Tools:

| Command | Does |
|---|---|
| `node tools/screens.mjs` | Screenshots every screen at 1280 and 412 px into `screens/` |
| `node tools/make-demo-kit.mjs` | Rebuilds `demo/wren.kit` (the demo character) |
| `node tools/make-icons.mjs` | Redraws the app icons |
| `node tools/sw-files.mjs` | Rewrites the service worker's pre-cache list after adding or removing files |
| `node tools/csp-hash.mjs` | Updates the Content-Security-Policy hash after editing the import map |
| `node tools/check-live.mjs` | After a push: checks the live site shows the new version with no errors |

`SPEC.md` is the source of truth (section 15 logs every decision); `CLAUDE.md` holds the working rules.

```
js/core/    pure logic, unit tested (mentions, short names, tags, search, kits, merge, ...)
js/data/    the only code that touches IndexedDB (Dexie)
js/ui/      Preact + htm components and screens; all wording in js/ui/strings.js
css/        tokens.css (the "field journal" palette), components.css, screens.css
tests/      unit/, e2e/ (Playwright), fixtures/ (one kit per schema version, kept forever)
```

## Licences

Libraries in `vendor/` keep their own licences (`vendor/licences/`): Preact and MiniSearch and fflate (MIT), htm and Dexie (Apache 2.0). The IM Fell English fonts by Igino Marini are under the SIL Open Font Licence 1.1 (`vendor/fonts/OFL.txt`).
