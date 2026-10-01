# Satchel: specification

Status: **APPROVED 2026-10-01.** Changes from here are logged in section 12.
Last updated: 2026-10-01 · Schema version: 1

Legend: **[NV]** = not verified. Confirm it against MDN, caniuse or the library docs before relying on it (build step 1).

---

## 0. Summary

**What it is:** a player-focused D&D character companion. It's a static web app (PWA) with one character per bundle.

**What it tracks:** backstory, campaign notes, images and connections between entities. No mechanics or stats; D&D Beyond handles those.

**Two layers:**
1. **Front (in session):** one screen, one box. Type, press Enter, done. Speed over everything.
2. **Back (out of session):** entities, relationships, triage, merge, graph. Optional, so nothing is lost if you never tidy up.

**Non-goals:** mechanics and stats, DM tooling, accounts, live/automatic cloud sync, multiplayer, iOS support. (A manual, optional "Sync now" to a private GitHub repo is in scope: see D14 and section 5a.)

---

## 1. Decisions made

| # | Decision | Why |
|---|---|---|
| D1 | **One combined box.** Typing shows live matches and recall cards; Enter saves a note; Shift+Enter adds a new line (desktop) | Nothing to switch, one thing to focus |
| D2 | **In-session / Out-of-session mode toggle** replaces "session auto-starts on first note of the day" | Fixes the midnight split, and notes don't have to belong to a session |
| D3 | **One character at a time.** The app holds one bundle | Simpler code. Switching character = Replace import |
| D4 | **Firefox first,** on Windows 11 and Android. iOS ignored. Chrome and Edge get best effort | Owner's choice |
| D5 | **Both devices used in session** → Merge import is in week one | Merge is the only way to reconcile two devices |
| D6 | **Hosted on GitHub Pages** (HTTPS). Dev server is `python -m http.server` | Free, boring. HTTPS/localhost is needed for the service worker and `crypto.randomUUID` |
| D7 | **IndexedDB, not localStorage** | localStorage is small, text-only and blocks the page; images rule it out |
| D8 | **Deletes are tombstones** (`deleted: true`), never removed rows | Otherwise Merge brings deleted records back |
| D9 | **Merge conflict rule:** newest `updated_at` wins; ties keep local; the import shows a report | Simple and predictable. Risk: device clocks that are wrong (Q4) |
| D10 | **File names as briefed:** `character.json` + `notes.jsonl` + `images/` | `character.json` holds everything except notes and images |
| D11 | **Input box sits at the bottom** (chat-style), results above it | The Android keyboard then pushes results up instead of covering them |
| D12 | **Import modes: New / Merge / Replace.** New only applies when the app is empty. Merge needs a matching `bundle_id`; a different character only allows Replace | Follows from D3 |
| D13 | **Notes keep `original_text`** once edited | Reconciles "append-only" with "edit later" |
| D14 | **Manual "Sync now" via a private GitHub repo:** pull → Merge → push. No checkout/locks. Emergency overwrite in either direction behind a confirmation. Optional; export/import still works without it | Merge never loses data, so no device has to be "the truth". Locks fail when you forget to check in. Every sync is a commit, so history doubles as backups |

## 2. Known risks

1. **Browser storage can be wiped.**
   - Eviction under storage pressure, "clear site data", or a reinstall can all wipe it.
   - Mitigations: the backup badge and nudge, a `persist()` request, and Restore offered whenever the app opens empty.
   - Backups remain your responsibility.
2. **Two devices means two databases.**
   - Until sync lands (week 2): export → move the file (e.g. a Google Drive folder) → Merge.
   - With sync: you still have to press "Sync now" on each device. The app can't know about changes the other device hasn't pushed yet.
   - **GitHub token in the browser:** anyone using that browser profile can write to the sync repo. Limit the token to that one repo.
3. **Clock skew.** If one device's clock is wrong, last-write-wins picks the wrong version.
4. **Firefox desktop has no standard PWA install [NV].**
   - On Windows the app may be a bookmarked tab, not an installed app. Recent Firefox versions may have "Taskbar Tabs".
   - Offline use via the service worker still works.
5. **Android keyboard focus [NV].** Mobile browsers may not raise the keyboard from programmatic focus until you tap the box. "Always focused" is fully achievable on desktop only.

## 3. Tech stack

Principle: no bundler, no compile step. Third-party files are downloaded once into `vendor/`, pinned and committed. npm is used only for the test tools.

| Need | Options considered | Pick | Trade-off |
|---|---|---|---|
| UI | Vanilla JS · **Preact + HTM** · Svelte/React with Vite | **Preact + HTM** (ES module files, no build) | Vanilla gets messy once the back layer arrives. Vite adds Node tooling. Preact+HTM gives React-style components with plain JS template strings and no compiler. Cost: learning components/state |
| Storage | raw IndexedDB · `idb` · **Dexie.js** | **Dexie** | Mature, good docs, built-in schema versioning and live queries |
| Search | substring · Fuse.js · FlexSearch · **MiniSearch** | **MiniSearch** | In-memory full-text with prefix + fuzzy matching. The index is rebuilt at load; expected to be fast at thousands of notes **[NV, measure]** |
| Zip | JSZip · **fflate** | **fflate** | Smaller and faster. Images are stored without recompression |
| PWA | Workbox (needs build) · **hand-written service worker** | **Hand-written** (~40 lines, versioned cache name) | No build step; offline works in a normal tab |
| Images | browser-image-compression · **native canvas** | **Native** `createImageBitmap` → canvas → `toBlob('image/webp')`, JPEG fallback | No dependency. Firefox WebP encoding support **[NV]**. Re-encoding strips EXIF/GPS data |
| IDs | **`crypto.randomUUID()`** (v4) | — | Built in; needs a secure context |
| Sync | Live DB (Supabase/Firestore/Dexie Cloud) · **GitHub REST API + private repo** | **GitHub API** via plain `fetch` | No server, no extra service, free history. Manual rather than live |
| Unit tests | **`node --test`** | — | Built into Node; zero dependencies |
| Browser tests | **Playwright, Firefox engine** | — | Desktop Firefox automated; Android is a manual checklist |

### Verification results (build step 1, done 2026-10-01)
Checked against MDN, Mozilla release notes and Bugzilla, GitHub docs and the npm registry. Items still marked **[NV]** below need a test on a real device.

**Pinned versions** (in `vendor/`, mapped by an import map in `index.html`):
- preact 11.0.0 + hooks
- htm 3.1.1
- dexie 4.4.6
- minisearch 7.2.0
- fflate 0.8.3

**Preact 11 is a new major version.** Check its breaking changes before using Preact 10 examples.

| Item | Result | Effect on the spec |
|---|---|---|
| `storage.persist()` | Desktop shows a permission prompt. Android behaviour **[NV]** | Ask at a sensible moment (first note), with a one-line explanation |
| WebP `toBlob` | Supported since Firefox 96 (desktop and Android) | WebP as planned |
| Private window IndexedDB | Works since Firefox 115, wiped when the private window closes | Show a warning banner in private mode if detectable |
| Desktop install | "Web Apps" (Taskbar Tabs) on Windows since Firefox 143, on by default | Ship a valid manifest; Windows users can pin it |
| Android install | Menu → Install / Add to Home screen works | Ship a valid manifest |
| `accept=".satchel"` on Android | Picker may grey out unknown extensions **[NV]** | **Changed:** no `accept` filter; check the file contents in JS |
| Web Share with files (Android) | Not supported in Firefox | **Changed:** export is download-only |
| GitHub API cross-origin | Allowed, including the `Authorization` header | Sync as planned |
| GitHub file limits | Contents API: full support ≤1 MB; Git Data blobs up to 100 MB | **Decided:** sync stores separate files, committed atomically via the Git Data API |
| Stale updates | Stale contents `sha` → 409 or 422; a non-forced ref update must be a fast-forward | Treat 409/422/non-fast-forward as "remote changed: pull, merge, retry" |
| Fine-grained token | One repo + Contents read/write supported; no-expiry allowed | Recommend a 1-year expiry; the app shows a clear "token expired" error |
| `randomUUID` on localhost | Secure context since Firefox 84 | As planned |

**Original verify-first list (kept for reference):**
- The current stable versions of Preact, HTM, Dexie, MiniSearch and fflate.
- Firefox behaviour of:
  - `storage.persist()`
  - WebP `toBlob`
  - private-window IndexedDB
  - `accept=".satchel"` on Android
  - Web Share with files on Android
  - Taskbar Tabs
- GitHub API:
  - calls from a web page work in Firefox (cross-origin requests allowed)
  - file-size limits on the file endpoint (recalled ~1 MB standard)
  - stale-version rejection (a `sha` mismatch is refused)
  - fine-grained token scoped to one repo with contents read/write

## 4. Data model

**Fields on every record:** `id` (UUID), `created_at`, `updated_at` (ISO 8601 UTC, displayed in local time), `deleted` (bool).

### Entity
| Field | Notes |
|---|---|
| `type` | `character \| npc \| faction \| location \| item \| other \| unknown`. Stubs start as `unknown` |
| `name` | |
| `aliases[]` | Merging entities adds the old name here, so typo mentions still resolve |
| `summary` | One line, for the recall card |
| `body` | Long text: backstory/description |
| `stub` | bool |
| `image_ids[]` | First one = primary |
| `merged_into` | id or null. A tombstone that redirects references |

The player character is the entity named by `pc_entity_id` in `character.json`.

### Note
| Field | Notes |
|---|---|
| `text` | Contains mention tokens |
| `original_text` | Set on first edit, so the original is never lost |
| `mode` | `in \| out` |
| `session_id` | Set when mode = in |
| `mentions[]` | Entity ids, derived from text |
| `triaged_at` | null = in the inbox |
| `promoted_to[]` | Entity/relationship ids |

**Mention token in text:** `@[Grimbold](<entity-id>)`
- Readable in the raw file, and survives renames: the app shows the current name and the label in the text is only a fallback.
- Merging entities rewrites ids in notes.

### Session
- Fields: `number` (S1, S2…), `started_at`, `ended_at`, `title?`, `summary?`.
- Toggling to In creates a session. Toggling to Out ends it.
- Auto-ends after 12 h with no notes; `ended_at` is set to the last note's time.

### Relationship
- `from_id`, `to_id`
- `type`: free text with suggestions (ally, rival, family, owes, member of, located in, enemy, employer)
- `directed` (bool), `notes`, `source_note_ids[]`

### Image
- `entity_id`, `file` (`images/<id>.webp`), `mime`, `width`, `height`, `bytes`, `caption`.
- The blob itself lives in a separate IndexedDB store.

### Local-only (never exported)
`last_backup_at`, `changes_since_backup`, current mode, whether persistent storage was granted, `device_name`, and sync settings (`repo`, `token`, `last_synced_at`, `last_synced_sha`, `changes_since_sync`).

## 5. The .satchel file

A zip with the custom extension `.satchel`. Filename: `<pc-name>-YYYY-MM-DD-HHmm.satchel`.

```
kael-2026-10-01-2130.satchel
├── character.json
├── notes.jsonl        one note per line, tombstones included
└── images/<image-id>.webp
```

`character.json`:
```json
{
  "format": "satchel",
  "schema_version": 1,
  "bundle_id": "uuid",
  "app_version": "0.1.0",
  "exported_at": "2026-10-01T11:30:00Z",
  "pc_entity_id": "uuid",
  "entities": [],
  "relationships": [],
  "sessions": [],
  "images": []
}
```
- Notes go in JSONL so one bad line doesn't sink the whole file, and diffs stay readable.

### Import pipeline
1. Unzip, and ignore any entry outside the expected names (blocks `../` path tricks).
2. Parse and check `format`.
3. Check `schema_version`:
   - Newer than the app → refuse with a clear message.
   - Older → run the migrations v1→v2→… in memory.
4. Validate. Duplicate ids keep the newest `updated_at` and get reported.
5. Apply the mode:
   - **New:** the app must be empty.
   - **Merge:** the `bundle_id` must match. Union by id, then the newest `updated_at` wins and ties keep local. Shows a report: added / updated / kept local.
   - **Replace:** typed confirmation, and it forces a backup download of the current data first.

## 5a. Sync (week 2, optional)

**Setup (one-off, per device):**
1. Create a private GitHub repo (e.g. `satchel-data`).
2. Create a fine-grained token limited to that repo, with contents read/write.
3. In Satchel settings, enter the repo, the token and a device name (e.g. "Pixel").

**Sync now:**
1. Pull the online copy (and note its `sha`).
2. Merge it into this device using the same Merge as import (newest `updated_at` wins, tombstones respected).
3. Push the result as one commit whose parent is the commit from step 1.
4. If GitHub refuses because the online copy changed in between (409, 422 or a non-fast-forward error), go back to step 1. Give up after 3 tries and show an error.
5. Record `last_synced_at` / `last_synced_sha`, reset `changes_since_sync`, write a commit message like `Sync from Pixel, 2026-10-04 21:40`.

**Storage in the repo:** the same contents as a `.satchel` file, unzipped: `character.json`, `notes.jsonl`, `images/<id>.webp`. Each sync is one atomic commit via the Git Data API (blobs → tree → commit → fast-forward ref update). Images upload only when new. History stays readable.

**Status shown in the top bar:**
- "N changes not synced" (this device).
- "Online copy changed since your last sync" (checked on app open, if online).
- "Last synced from <device>, <time>".
- A successful sync also counts as a backup for the backup badge.

**Emergency options** (behind a typed confirmation):
- "Replace online copy with this device"
- "Replace this device with online copy" (forces a local backup download first)

**Without sync:** export/import works exactly as before. Friends don't need GitHub.

## 6. Front layer

**Layout**
- **Top bar:** In/Out toggle (shows the session number), backup badge, menu (Export, Import, Back layer).
- **Results area** sits above the input box. The box is pinned to the bottom.

**Live results while typing**
- While you're typing an `@token`: entity matches.
- When the text is 4 words or fewer: full search.
- Whenever the text contains an exact name or alias: that entity's recall card.

**Recall card**
- The summary (or, if empty, the first mention).
- The last 3 mentions, each with its session number.

**Picking an @ suggestion**
- Tab or tap picks a suggestion. **Enter always saves** (no accidental picks).
- On save, an unresolved `@Word` matches a name/alias exactly (case-insensitive), or else becomes a stub.
- Multi-word stubs use underscores: `@Lord_Aldric` creates "Lord Aldric".

**Other keys and states**
- **Empty box:** shows the recent notes feed.
- **Esc:** clears the box.

### Backup status
- Header badge:
  - `--ok`: backed up since the last change.
  - `--warn`: changes older than 24 h.
  - `--err`: never backed up, or more than 7 days with changes.
- A nudge appears when you switch to Out of session.
- "Backed up" means the file was downloaded, not that it's stored safely somewhere.
- If the app opens empty, it offers "Restore from backup".
- Requests `navigator.storage.persist()` on first note (Firefox may show a prompt **[NV]**).

## 7. Back layer (weeks 2–3+)
- Entity list and editor (type, name, aliases, summary, body, images).
- Note edit (keeps `original_text`) and delete (tombstone).
- Inbox triage:
  - Lists all notes with `triaged_at = null`, filterable by In/Out.
  - Promote a note to an entity body or a relationship, or mark it as raw log.
- Merge entities:
  - Pick the survivor; the loser becomes `merged_into` with its name added to aliases.
  - Notes are rewritten to point at the survivor.
- Relationships editor.
- Graph view (later; library choice deferred).

## 8. Visual style

| Variable | Value | Use |
|---|---|---|
| `--bg` | #F5F5F0 | Page background |
| `--bg-alt` | #E6E6E1 | Panels, cards |
| `--border` | #D9D9D3 | Borders, dividers |
| `--text` | #4A4A4A | Body text, focus ring |
| `--muted` | #8A8A8A | Timestamps, secondary labels only |
| `--ok` | #B8D8C0 | Success backgrounds |
| `--warn` | #E6CFA1 | Warning backgrounds |
| `--err` | #D4B4AF | Error backgrounds |

- `--radius: 3px`. No pill buttons.
- Font stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Status colours are backgrounds with `--text` on top, never text colours.
- `--muted` on `--bg` is about 3.2:1 contrast (my calculation), which fails the WCAG 4.5:1 guideline for small text. Use it only for timestamps and secondary labels.
- No other colours. No dark mode (the palette is light-only).

## 9. Week-one milestone

**Done when:** on Firefox on Windows 11 **and** Firefox on the Pixel, via the GitHub Pages URL, you can:
1. Toggle In / Out of session.
2. Type a note, press Enter, and see it saved with a timestamp.
3. Use `@` mentions with autocomplete; unknown names create stubs.
4. See live search and recall cards as you type.
5. Export a `.satchel` file, and see the backup badge update.
6. Import in New mode (empty app).
7. Merge an export from the other device.
8. Reload or close the browser and still have your data. Persistent storage is requested.

**Stretch, in order:** service worker for offline use · inline "add summary" on the recall card.

**Not in week one:** images, back layer, Replace import, triage, relationships, merge entities, graph.

### Build order
1. Verify the [NV] items and pin library versions.
2. Repo and GitHub Pages skeleton (hello-world page live on the URL).
3. `db.js` / `model.js` (Dexie schema, record factories).
4. Capture box and notes feed.
5. Mentions (parse, autocomplete, stubs).
6. Search and recall cards.
7. Export.
8. Import (New, Merge).
9. Backup badge and nudge.
10. Mode toggle and sessions.
11. Android pass (manual checklist).

### Later phases
- **Week 2:** **Sync now (first)**, then entity list and editor, note edit/delete, merge entities, Replace import, offline mode.
- **Week 3:** inbox triage, relationships, images.
- **Later:** graph view.

### Project layout
```
satchel/
  index.html  manifest.webmanifest  sw.js  SPEC.md
  css/app.css
  js/ app.js db.js model.js mentions.js search.js bundle.js merge.js sync.js images.js ui/
  vendor/   (pinned preact, htm, dexie, minisearch, fflate)
  tests/unit/  tests/e2e/  tests/fixtures/*.satchel
```

## 10. Test plan

**Unit tests** (`node --test`, pure logic):
- mention parsing and resolution
- the Merge algorithm
- schema migrations
- bundle validation
- duplicate-id handling
- the search trigger rule

**Browser tests** (Playwright, Firefox):
- capture → Enter → saved
- `@` → stub; `@` existing → linked
- recall card shows the last 3 mentions
- export → wipe → import New gives identical data (round trip)
- two diverged exports → Merge → expected result
- data survives a reload

### Edge cases
- **Storage wipe:** clear the site data → the app opens empty and offers Restore.
- **Duplicate IDs in a file:** keep the newest and report it.
- **Old schema:** keep a fixture file for every schema version, forever, and import each one in the test run.
- **Newer schema:** refused with a clear message.
- **Merge conflicts:**
  - Same note edited on both devices → newest wins.
  - Deleted on A, edited later on B → B wins (resurrected). Accepted.
  - Entity merged on A while B kept mentioning the stub → `merged_into` redirects.
  - Different `bundle_id` → only Replace is offered.
- **Clock skew:** known risk, documented (section 2).
- **Sync (week 2):**
  - Both devices sync at the same moment → the second gets a `sha` conflict, pulls, merges, retries, and nothing is lost.
  - Phone offline mid-sync → clear error, local data untouched.
  - Bad or expired token → clear error pointing at settings.
  - Repo is empty (first sync) → push only.
  - Online copy is a different `bundle_id` → refuse; offer the emergency overwrite only.
  - Online copy has a newer `schema_version` → refuse.
  - The token is never included in exports or commit contents.
  - Unit test the pull → merge → push logic against a fake GitHub API.
- **Bad files:** corrupt zip, a bad line in `notes.jsonl`, a `../` path in the zip, a non-zip renamed to `.satchel`.
- **Large images (week 3):**
  - 20 MB phone photo
  - 12 000 px panorama
  - transparent PNG
  - corrupt image
  - non-image file renamed to `.jpg`
  - quota-exceeded error
- **Other:**
  - Two tabs open at once (stale state → refresh between tabs, or warn).
  - Private window **[NV: Firefox may keep the data in memory only]**.
  - Emoji and non-English names.
  - A very long note.

### Android manual checklist
- The keyboard doesn't hide results.
- The keyboard's Enter key saves.
- Tapping an autocomplete suggestion works.
- The export lands in Downloads.
- The file picker lets you select a `.satchel` file (no `accept` filter) **[NV]**.
- Note what `persist()` does on Android: prompt, silent grant or refusal **[NV]**.
- Menu → Install puts Satchel on the home screen.

## 11. Open questions
- ~~Q1~~ Resolved: `@Lord_Aldric` (underscores → spaces).
- ~~Q2~~ Resolved: yes, auto-end after 12 h idle; the end time is set to the last note.
- ~~Q3~~ Resolved: all un-triaged notes go to the inbox, filterable by In/Out.
- ~~Q4~~ Resolved: newest edit wins; clock-skew risk accepted; the merge report shows what was overwritten.
- ~~Q5~~ Resolved: add an `item` entity type (story items only, no stats).

No open questions remain.

## 12. Decision log
| Date | Decision |
|---|---|
| 2026-10-01 | One combined box (D1) |
| 2026-10-01 | Both devices in session → Merge in week one (D5) |
| 2026-10-01 | Firefox on Windows 11 + Android; iOS ignored (D4) |
| 2026-10-01 | In/Out session toggle instead of day-based sessions (D2) |
| 2026-10-01 | One character at a time (D3) |
| 2026-10-01 | GitHub Pages hosting (D6) |
| 2026-10-01 | Multi-word mentions via underscores (Q1) |
| 2026-10-01 | Auto-end session after 12 h idle (Q2) |
| 2026-10-01 | All notes go to the triage inbox (Q3) |
| 2026-10-01 | Last-write-wins merge, clock-skew risk accepted (Q4) |
| 2026-10-01 | `item` entity type added (Q5) |
| 2026-10-01 | Manual "Sync now" via private GitHub repo, merge-based, no locks; first item in week 2 (D14) |
| 2026-10-01 | SPEC approved |
| 2026-10-01 | Step 1 done: libraries pinned; no `accept` filter on import; export is download-only; sync uses separate files + Git Data API commits |
