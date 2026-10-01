# Satchel v2: specification

Status: **APPROVED 2026-10-01** (including the field-journal style). Written from everything learned building v1. Open questions in section 14 take the recommended answers unless Jake says otherwise.
This document is **self-contained**: a fresh Claude session on a new machine should be able to build Satchel v2 from this file and `CLAUDE.md` (in the same folder) alone, with no access to v1 or its history.

Legend: **[NV]** = not verified; check before relying on it (milestone M0 does this). **(v1)** = proven in v1, keep as is.

---

## 0. How to use this document

1. Read sections 1–3 for the product, then section 13 (lessons from v1) **before writing any code**.
2. Build in the milestone order of section 12. Every milestone has "done when" criteria; don't start the next until they pass.
3. Log every decision made during the build in section 15 (decision log), with the date.
4. Owner: Jake. Working preferences are in `CLAUDE.md`. Summary: blunt, concise, AU English, end every reply with a **Next step**, ask at most 3 questions at a time, he mostly reviews behaviour rather than code.

---

## 1. Product

**Satchel** is a player's companion for one D&D character. Players jot notes fast during a session and tidy them up afterwards. There are no stats or mechanics (D&D Beyond does those), no accounts and no server.

### Principles
1. **Two moments, one app.**
   - **At the table:** one box. Type, press Enter, done. Speed beats everything.
   - **Afterwards:** a tidy-up space for people, places, notes and files. Optional: nothing is lost if you never tidy.
2. **Nothing gets lost.** Data lives in the browser. Backups are one tap. Deletes are recoverable until merged away. Destructive actions are confirmed.
3. **Real notes are messy.** Shorthand, typos, first names, swearing. The app must cope with how people actually type (section 4).
4. **Boring, planned, consistent.** One way to do each kind of thing (section 5.3).

### Users
Jake and friends. Firefox on Windows 11 and Android (Pixel). Nothing to install: they open a URL.

### Non-goals
- Stats, mechanics, dice, character sheets (link to D&D Beyond instead).
- Accounts, servers, cloud sync of any kind, including GitHub sync (v1 had it; v2 drops it).
- Multiplayer or real-time sharing; DM tools.
- More than one character per app (switching characters = Replace, section 7).
- iOS/Safari testing (best effort only).
- Rendering Markdown (text files show as plain text).

---

## 2. Platform and stack

| Need | Choice | Why |
|---|---|---|
| Hosting | GitHub Pages (static, HTTPS), same repo as v1 | Free; HTTPS needed for service worker and `crypto.randomUUID` |
| UI | **Preact + HTM**, ES modules, **no build step** (v1) | React-style components without a compiler; nothing to install to run |
| Storage | **Dexie** over IndexedDB (v1) | Schema versions, live queries, works in Firefox |
| Search | **MiniSearch** (v1) | Prefix + typo-tolerant full text, in memory; 5000 notes index in ~30 ms (v1 measured) |
| Zip (kits) | **fflate** (v1) | Small, fast |
| Offline | Hand-written service worker, **network-first** (v1) | Always the latest build online; works offline |
| Images | Native canvas → WebP (JPEG fallback) (v1) | No dependency; strips photo metadata |
| Unit tests | `node --test` (v1) | Built in |
| Browser tests | **Playwright, Firefox engine**, 4 workers (v1) | 8 workers overloaded the PC |
| Dev server | `python3 -m http.server` (v1) | Jake is Python-first; preinstalled on Ubuntu |
| Build machine | Ubuntu (Node LTS via nvm, git, python3, Playwright Firefox with `--with-deps`) | Targets stay Firefox on Windows and Android; check those by hand at each milestone |

**Library versions:** vendor pinned ESM builds into `vendor/` and use an import map in `index.html`. Check the current versions at M0 **[NV]**. v1 used preact 11.0.0, htm 3.1.1, dexie 4.4.6, minisearch 7.2.0 and fflate 0.8.3. Preact 11 notes: numbers in `style` don't get `px` added, and `useRef` needs a starting value.

**Verified in v1 (Firefox):**
- `storage.persist()` shows a prompt with "remember decision" on desktop and Android.
- WebP encoding works.
- Private windows: IndexedDB works but is wiped when the window closes.
- Android Firefox can install sites with a valid manifest.
- A file picker with `accept=".kit"` may grey out files on Android, so **no `accept` filter**: check the file in code.
- Web Share with files is not supported: export is a plain download.
- A `.kit` download keeps its name on Android.
- Firefox for Windows has "Web Apps" (Taskbar Tabs) since Firefox 143.

---

## 3. Data model

All records share `id` (UUID v4), `created_at` and `updated_at` (ISO UTC; displayed in local time, en-AU) and `deleted` (bool). **Deleting creates a tombstone** (the record stays, marked deleted) so merges carry deletions.

### 3.1 Character (the bundle)
- One per app: `bundle_id`, plus `pc_entity_id` pointing at the player character's entity.
- The PC entity carries:
  - **`profile`:** `concept, backstory, personality, ideals, bonds, flaws, goals, appearance, notes`, all plain text.
  - **`profile_times`:** `{ section: ISO }`, the last edit time per section, so merges keep edits made to different sections on two devices (v1).
  - **`dndbeyond_url`:** optional, must start with `https://www.dndbeyond.com/` (character pages are `/characters/<id>`) or `https://ddb.ac/` (D&D Beyond's official short share links, `ddb.ac/characters/<id>/<key>`). Checked at M0. Shown as an "Open in D&D Beyond" button on the dashboard, the character page and the in-session overview (new tab).
  - **`portrait_file_id`** (any entity can have one).

### 3.2 Entity types (new: built-in + custom)
A `types` table holds every type, including the built-ins, so they all behave the same way.

| Field | Notes |
|---|---|
| `id` | Built-ins have **fixed ids** (`type-npc`, `type-location`, `type-faction`, `type-item`, `type-character`, `type-other`) so kits from any device agree |
| `label` / `plural` | e.g. "Deity" / "Deities" |
| `person` | bool. Person types get **short names** (section 4.3). Built-ins: npc and character are people |
| `builtin` | Built-ins can be renamed and get fields, but not deleted |
| `fields[]` | `{ id, label, kind, link_type? }`. `kind` is one of `text`, `long_text`, `number`, `date`, `link` (to another entity, optionally of one type), `url` |
| `order` | Position in lists |

- **Stub** isn't a type: it's an entity with `stub: true` and no type yet (`type_id: null`).
- Deleting a custom type is allowed only when no live entity uses it, or after you choose a type to move them to (destructive: confirm).
- Removing a field hides its values; they stay in the record, so re-adding the field restores them.

### 3.3 Entity
`type_id`, `name`, `aliases[]`, `tags[]`, `summary` (one line, shown on recall cards), `body` (long text), `fields: { fieldId: value }`, `stub`, `portrait_file_id`, `merged_into` (a tombstone redirect after a merge).

### 3.4 Note
| Field | Notes |
|---|---|
| `text` | Mentions stored as tokens `@[label](entityId)`; tags kept as typed `#tag` text |
| `mentions[]` | Entity ids (derived) |
| `tags[]` | Lower-case tag keys (derived from `#tags`, section 4.4) |
| `mode` | `in` or `out` (written in or out of session) |
| `triaged_at` | null = in the Inbox |
| `promoted_to[]` | Ids the note was added to |
| `original_text` | The first version, set on first edit (v1) |

### 3.5 Relationship (v1)
`from_id`, `to_id`, `type` (free text, suggested list), `directed` (bool), `notes`, `source_note_ids[]`.
- Suggested types: ally, rival, family and enemy (both ways); owes, member of, located in and works for (one-way).
- An unknown type defaults to one-way.

### 3.6 File (v1)
- Fields: `entity_id` (or null), `name`, `kind` (`image` | `text`), `mime`, `size`, `width`/`height`, `caption`. Bytes live in a separate `blobs` table.
- Accepted: images (re-encoded to WebP at quality 0.85, longest side 2560 px) and `.txt`/`.md`, checked as valid UTF-8. **10 MB** max.

### 3.7 Local-only (never exported)
- Session mode: `mode`, `mode_since`.
- Backup status: `last_backup_at`, `changes_since_backup`, `first_change_at`.
- Persistence: `persist_asked`, `persist_granted`.
- Device-level keys (mode, persist) survive Replace and New character.

### 3.8 Database
- Dexie tables: `entities, types, notes, relationships, files, blobs, meta`.
- Start at local db version 1 for v2; add versions only via upgrades.
- Only index fields you query on. IndexedDB can't index booleans or nulls, so `deleted` and `triaged_at` are filtered in code.

---

## 4. Typing rules: mentions, short names, tags

This is the heart of the app. Every rule below was found the hard way in v1.

### 4.1 Mentions
- **Typed form:**
  - `@Name`; multi-word names use underscores, `@Lord_Aldric` → "Lord Aldric".
  - A possessive is dropped and stays as text: `@Mira’s` → Mira, then "’s". Handle both straight `'` and curly `’` apostrophes.
  - Trailing `_ - ’` characters are dropped.
  - `@` only counts at the start of the text or after a non-word character, so emails don't trigger it.
  - Unicode letters are allowed.
- **Resolution on save,** in order:
  1. The autocomplete pick (the exact entity the user chose).
  2. An exact name or alias match, ignoring case. If several match, prefer a non-stub, then the most recently edited.
  3. A **short name** (4.3).
  4. Otherwise a new **stub**.
- **Stored form:** `@[label](id)`, readable in exports. The UI always shows the entity's *current* name, so renames flow through. Strip `[]` from labels.
- **Editing a note** shows tokens in typed form, remembers which entity each one was, and re-resolves on save. Tokens whose entity has since been deleted are left untouched, so an edit never creates new stubs.

### 4.2 Autocomplete (capture box)
- Typing `@` lists suggestions: prefix matches first, then substring matches, up to 5, newest first.
- **Tab or tap picks; Enter always saves.** Arrow keys move the highlight; Esc closes the list, and a second Esc clears the box.
- Act on **pointerdown with preventDefault**, so the phone keyboard stays open.
- A "new stub: X" hint shows when nothing matches.
- **Typing cancels any pending caret restore.** v1 bug: a fast tap-then-type scrambled letters ("odayt").

### 4.3 Short names
People say "Grimbold", not "Grimbold Ironhand".
- **Which entities get them:** people only (person types and stubs).
- **Which words count:** any word of a multi-word name that is **4+ letters** and belongs to **no other entity** (not part of another name, and not another entity's name or alias).
- **Examples:** "Grimbold", "Caldra" (Sister Caldra) and "Aldric" count. A shared surname ("Ashdown") or a title shared by two NPCs ("Sister") doesn't.
- **Used for:** recall cards, tap-to-link and `@mention` resolution.
- **Tap-to-link picks the occurrence that ends last;** among those, the longest. So "lord aldric" beats the short name "aldric" inside it (v1 regression).

### 4.4 Tags on notes (new)
- **Typed form:** `#tag`, multi-word `#two_words`. It counts after the start of the text or a non-word character, so URLs with `#` don't trigger it; the same rules as `@`.
- **Stored:** as typed in the text, plus a derived `tags[]` of lower-case keys (underscores become spaces).
- **Capture box:** typing `#` suggests existing tags (most used first). Tab or tap picks.
- **Display:** a tag shows as a quiet chip in note text. Tapping it out of session opens the Notes list filtered to that tag.
- **Entity tags** (on entities) and **note tags** are separate lists, but search covers both.
- No tag colours or hierarchy.

### 4.5 Recall cards (in session) (v1)
- **When they appear:**
  - while typing an `@token`: a card for the highlighted suggestion;
  - when the text contains an exact name, alias or short name: that entity's card, up to 3, most recently typed first;
  - never for the player character.
- **What a card shows:**
  - name, type and tags;
  - the summary, or "First mention: …" when there are more than 3 mentions;
  - up to 3 relationships as plain text;
  - the last 3 mentions, dated.
- **Actions on a card:**
  - **Tap to link:** turns the plain name into a mention.
  - **Quick type:** a "stub ▾" picker sets a stub's type in one tap.
- **Search alongside:** text of 4 words or fewer also runs full search. Typo tolerance: 0 edits for ≤3 letters, 1 for 4 letters, 2 for 5+ (swapped letters count as 2).
- **Layout:** results stack bottom-up, with the best match nearest the box, so the phone keyboard never hides them.

---

## 5. Screens and navigation

### 5.1 Frame (every screen)
- **Top bar,** always one line:
  - **Home** (the character name; long names end in "…");
  - **breadcrumbs** for the current location ("Home › NPCs › Grimbold Ironhand");
  - a **session button** ("Start session" / "● In session");
  - the **backup badge**;
  - **Menu**.
  - **Phone (≤600 px):** breadcrumbs move to their own thin line under the bar; the session button shortens to "Session"; the badge drops "since backup" ("3 changes"); the name ends in "…". The bar must never wrap (it wrapped to three lines in the style preview before this rule).
- **Menu** (short): Export kit, Import kit, How it works, Settings, New character. The build number goes at the bottom.
- **Messages:** toasts float under the top bar without moving the page (v1 fix). Tap to dismiss; they auto-hide after 8 s.
- **Page addresses:** hash routes (`#/world/npc`), so the back button works.
  - The router must re-read the address when its listener attaches (v1 race).
- **Phone:** works at 412 px wide with no sideways scroll; the app height follows `visualViewport` so the keyboard never hides the box.

### 5.2 Screens
| Screen | Address | Contents |
|---|---|---|
| **Home** (hub) | `#/` | Search everything (top). Panels: My character (portrait, concept, D&D Beyond button), Inbox (count), World (counts per type, stubs), Recent notes, Recent files. Quick note box at the bottom |
| **Session** | (shown while in session) | v1 capture screen: feed, live results/recall cards, one box. Tap the name for the character overview. The top bar shows "● In session"; End is one tap |
| **Inbox** | `#/inbox` | Unsorted notes, oldest first. Filter: All / In / Out. Per note: Keep as log; Add to (each mentioned entity); Add to my character (choose a section); Add as relationship; Edit; Delete. Mark all as log. Show sorted → Back to inbox |
| **Notes** | `#/notes` | All notes, newest first. Filter by text, tag, mode, or mentioned entity. Edit/delete in place |
| **World** | `#/world` | Types with counts (built-in + custom) and Stubs; manage types (add type, add/rename fields) |
| **Type list** | `#/world/<typeId>` | A–Z list, filter by name/alias/tag/field value, add new |
| **Entity** | `#/entity/<id>` | Name, type, tags, aliases, summary, description, **custom fields**, files, relationships plus connections diagram, notes mentioning it. Merge into…, Delete |
| **Character** | `#/character` | Portrait, name, concept, D&D Beyond link, profile sections, files, relationships |
| **Files** | `#/files`, `#/files/<id>` | Grid; viewer (rename, attach, use as picture, download, delete) |
| **Settings** | `#/settings` | Backup status (last export, unsaved changes), storage persistence status, manage types shortcut, danger zone (New character) |
| **Help** | dialog | "How it works" (v1 text, updated) |
| **First run** | | Name a new character · Import a kit · Try the demo character |

### 5.3 Interaction rules (fixing v1's "too many dialogs and menus")
1. **Edit in place:**
   - Fields autosave 0.7 s after typing stops, and when you leave the field.
   - Saving the same value is a no-op.
   - While a field is focused, outside updates don't overwrite what you're typing.
2. **One confirm sheet** (a single shared component), only for destructive actions: delete, merge, delete type, Replace, New character.
   - Replace and New character also need the **character's name typed**, and download a backup kit first.
3. **One inline-form pattern** (expand under the row, Save/Cancel) for multi-field adds: relationships, inbox → relationship, custom fields. Never a pop-up for adding.
4. **Pickers:**
   - Entity pickers are one searchable list component used everywhere (merge target, relationship "with", link fields, file attach).
   - New names typed into a picker create a stub, the same as `@mentions` do.
5. **Buttons:** primary (one per area), secondary, quiet (small, transparent), danger. The main actions come first; less common ones go in a quieter row.
6. **Labels:** types as title case (NPC, Location); lower case inside sentences. Counts with singular and plural ("1 note", "2 entities").

### 5.4 Visual system: "field journal"
The look is an adventurer's field journal: ink on aged paper, ruled lines, a red margin, and sparing marks in red and green. It fits the satchel/kit idea without costing readability at the table. (This replaces v1's plain technical look.)

**Palette.** Only these colours; define them as CSS variables in `css/tokens.css`. Contrast is against `--paper`, computed with the WCAG formula (re-checked at M2, including against `--paper-alt`). AA needs 4.5:1 for normal text.

| Variable | Value | Use | Contrast |
|---|---|---|---|
| `--paper` | #F6F1E4 | Page background | |
| `--paper-alt` | #EDE5D2 | Panels, cards, top bar | |
| `--rule` | #D8CDB6 | Borders, ruled lines, dividers | |
| `--ink` | #3B3026 | Body text, primary buttons (ink fill, paper text) | ~11.4:1 |
| `--ink-muted` | #736452 | Secondary text, timestamps, hints | 5.1:1 on paper, 4.6:1 on paper-alt (darkened at M2 from #7A6A57, which was 4.2:1 on panels). Never on highlight or washes |
| `--red` | #9C4A3A | Margin line, danger, wax-seal accents, focus ring | ~5.4:1 |
| `--green` | #4F6B47 | "Done/backed up" marks | ~5.2:1 (darkened from #5E7A55, which was ~4.3:1) |
| `--wash-ok` | #DCE5D3 | Success background | |
| `--wash-warn` | #EED9AE | Warning background | |
| `--wash-err` | #E9C9BF | Error background | |
| `--highlight` | #E2D3B0 | Mention chips (with a 1 px `--ink-muted` underline), selected rows. #EADFC4 was too close to `--paper-alt` inside panels (seen in the style preview) | |

- Washes are backgrounds with `--ink` text on top; never wash colours as text.
- No dark mode for 1.0.

**Type**
- **Headings:** page titles, panel headings, the app name and the first-run title use **IM Fell English** (old-book serif, SIL Open Font Licence), **bundled** in `vendor/fonts/` as woff2 so it works offline. Include the licence file. Fallback: Georgia, serif. **[NV: confirm licence, file size (<100 KB per weight) and legibility at 20 px at M0; alternative: EB Garamond.]**
- **Body, notes, inputs, buttons:** the system font stack, kept crisp for fast reading and typing on the phone.
- **Numbers are never set in the serif.** Its old-style figures make "11" read as "II". Counts, dates and times inside headings use the system font (a `.num` span).
- **Scale:** 12/13/14/16/20/26 px. Headings 20 px (panels, in small caps) and 26 px (page titles).

**Shapes and detail**
- Corner radius 3 px; no pill buttons (kept from v1).
- **Ruled lines:** lists and the notes feed use a 1 px `--rule` line under each row, like a ruled page.
- **Red margin:** on desktop (≥760 px), a 1 px `--red` vertical line runs down the left of the page content, like a notebook margin. Not on the phone (it costs width).
- **Paper grain:** an optional, very subtle noise texture on `--paper`, made with an inline SVG data URI in CSS (no image files). It must not lower text contrast. Easy to turn off in `tokens.css`.
- **Buttons:**
  - primary = `--ink` fill with paper text (like a stamp);
  - secondary = ink outline;
  - quiet = text only, underlined on hover;
  - danger = `--red` outline, or `--red` fill inside the confirm sheet.
- **Mentions** show as a `--highlight` chip; **tags** as small `--ink-muted` text with a leading `#`.
- **Focus:** a 2 px `--red` outline.
- **Icons:** few, simple, line style in `--ink`, inline SVG. No emoji in the UI chrome.
- **App icon:** the satchel drawn in ink on paper with a red wax-seal clasp (redo `tools/make-icons.mjs` with this palette). Manifest `background_color` #F6F1E4, `theme_color` #EDE5D2.

**Wording: light touch.** Labels stay plain where clarity matters (Inbox, Notes, World, Files, Search, Start session, the badge texts). The theme appears at signature moments:

| Where | Text |
|---|---|
| Export / import | **Pack kit** / **Unpack kit** (v1) |
| Export toast | "Kit packed: kael-2026-10-01-2130.kit" |
| Merge toast | "Kit unpacked into your satchel: 3 added, 1 updated." |
| Empty notes | "Your satchel is light. Type below and press Enter." |
| Empty inbox | "Nothing loose. Every page is filed." |
| Empty files | "No maps or scraps yet." |
| First run | "A satchel for one adventurer. Everything stays in this browser." |
| End-of-session nudge | "Session over. Pack your kit before you go?" |

Keep a single `js/ui/strings.js` with all user-facing text, so wording can be tuned in one place.

**Spacing scale:** 4/8/12/16/24 px.

Define components first (M2): Button, Field, ChipsField, Select, EntityPicker, ListRow, Panel, Card, Toast, Sheet, InlineForm, Thumb. M2's component gallery page doubles as the visual-style review: screenshot it at both widths before building screens.

**Reference:** `style-preview.html` (next to this spec) is a static mock of the palette, type, top bar (desktop and phone), panels, notes, a recall card, buttons and badges. Open it in Firefox; it's the visual target for M2.

---

## 6. In/Out of session
- **Toggle:** the top-bar session button.
  - **In session:** the capture screen is on every address. Notes get `mode: 'in'`.
  - **Out of session:** the hub and pages. Notes get `mode: 'out'`.
- **Auto-end:** after 12 h with no in-session note or mode change. Checked on open and every minute, with a toast.
- **End-session nudge:** with unsaved changes, ending a session offers **Export kit** (or *Not now*).
- New characters start out of session.

---

## 7. Backup, devices, kits (no sync)

### 7.1 Kit file
A `.kit` file is a zip:
```
<character>-YYYY-MM-DD-HHmm.kit
├── character.json   format "satchel", schema_version, bundle_id, exported_at, pc_entity_id,
│                    entities, types, relationships, files (records)
├── notes.jsonl      one note per line, tombstones included
└── files/<id>.<webp|jpg|txt|md>   bytes of live files only
```
- **Canonical JSON** (keys sorted) so the same data gives the same bytes (v1).
- **Schema version:** v2 starts at **schema_version 3**, so it never collides with v1's 1–2. Importing v1 kits is optional (decision log).
- **Unpack checks:**
  - not a zip / no `character.json` / damaged JSON / wrong format → refuse;
  - newer schema → refuse ("made by a newer Satchel");
  - older schema → migrate in memory;
  - bad note lines → skip and report;
  - duplicate ids → keep the newest;
  - unknown or `../` paths → ignore;
  - missing optional fields → defaults.
- **Filename:** an ASCII slug of the character name.

### 7.2 Import modes
| Mode | When | What |
|---|---|---|
| New | App empty | Load the kit; badge = backed up as of `exported_at` |
| Merge | Same `bundle_id` | Union by id, newest `updated_at` wins, a tie keeps local; per-section profile merge; types merge like records; combine duplicate stubs; redirect `merged_into`. **Doesn't count as unsaved changes** |
| Replace | Any (a different character, or discard local) | Typed-name confirm, backup kit downloads first, one transaction (old data kept if loading fails) |

**Duplicate stubs (merge):** stubs with the same name fold into the single real entity with that name if there's exactly one; otherwise into the oldest stub (oldest `created_at`, then lowest id), so every device picks the same survivor. Mentions, relationships and files are redirected.

### 7.3 Backup badge (v1)
| Badge | When |
|---|---|
| Green **Backed up** | No changes since the last export |
| Grey **N changes since backup** | Changes under 24 h old |
| Yellow, same text | Changes over 24 h old |
| Red | Never backed up, or changes over 7 days old |

- Ages from `first_change_at`; re-checked every minute.
- Tap the badge = Export kit.
- "since backup" is hidden on narrow screens.

### 7.4 Moving between devices
Export on device A → move the file (Drive, USB, email) → Import / Merge on device B. Document this in Help. Each device only knows about its own unsaved changes.

---

## 8. Demo character
- **`demo/wren.kit`**, built by a script (`tools/make-demo-kit.mjs`) from the app's own code. Offered on the first-run screen ("Try the demo character").
- **Content:** a month of play written as **real table notes**: typos, shorthand, swearing, chatter, emoji.
  - Tags like "fuck this guy" and "do NOT trust".
  - Notes typed with `@` and `#` and run through the real resolver, so building the demo exercises the parser.
  - **Deliberate rough edges:** unsorted notes, a typo stub, untyped stubs, an edited note.
  - **Custom type examples:** "Deity" with a "Domain" field; "Ship" with a "Captain" link field.
  - A D&D Beyond link.
- **Stable ids** derived from keys, so rebuilds merge cleanly.
- Her character page's Notes section says it's a test character and lists what to poke at.

---

## 9. Code structure
```
index.html  manifest.webmanifest  sw.js  icons/  demo/  vendor/
css/        tokens.css (palette, spacing, type) · components.css · screens.css
js/core/    pure logic, no browser APIs, unit tested:
            model.js types.js mentions.js tags.js search.js kit.js merge.js backup.js session.js files-rules.js
js/data/    the only code that touches Dexie:
            db.js (schema) entities.js notes.js types.js files.js relationships.js kits.js meta.js
js/ui/components/   one component per file (Button, Field, Sheet, EntityPicker, ...)
js/ui/screens/      one screen per file (Home, Session, Inbox, Notes, World, TypeList, Entity, Character, Files, Settings)
js/ui/app/          App.js (frame), router.js, Toasts.js
tools/      make-demo-kit.mjs, make-icons.mjs, screens.mjs (screenshot review)
tests/unit/ tests/e2e/ tests/fixtures/
```
**Rules:**
- **Core is pure;** screens never import Dexie directly.
- **Every write goes through `data/`,** which handles change counters (`save()` / `saveMany()`) and transactions.
- **Comments explain *why*,** not *what*. A file over ~250 lines gets split.

---

## 10. Quality bars
| Area | Target |
|---|---|
| Speed | Capture save < 100 ms; search < 50 ms at 5000 notes; no visible lag typing with 5000 notes (check in M10) |
| Phone | 412 px wide, no sideways scroll on any screen (automated test) |
| Offline | Opens and captures with no network after one online visit |
| Data safety | No action loses data without a confirm; every import validates first; merges are deterministic |
| Accessibility | Every control labelled; dialogs `role=dialog` with names; focus returns to the box after card/overview actions |
| Security | No `innerHTML` with user data; text files shown as text; Content-Security-Policy allowing only the app's own scripts (hash the import map) **[NV: verify CSP with import maps in Firefox]** |

---

## 11. Testing strategy
- **Unit tests** (`node --test`) for all of `js/core`:
  - mentions (every rule in section 4), tags, short names;
  - merge (both directions, idempotent, deterministic, stubs, profiles, types);
  - kit (round trip, canonical bytes, every refusal, migrations);
  - backup, session, file rules.
- **Syntax-check every module** in the unit run. A duplicate declaration breaks the whole app, and browser tests only show it as timeouts.
- **Browser tests** (Playwright, Firefox, 4 workers): one spec per screen, plus:
  - **two devices** = two browser profiles exchanging kits;
  - **demo kit** unpacks with the expected counts;
  - **phone width** on every screen;
  - **offline** (service worker);
  - **install** (manifest and icons).
- **Fixtures:** keep `tests/fixtures/schema-<n>.kit` for every schema version, forever.
- **Screenshot review:** `tools/screens.mjs` seeds or unpacks the demo and screenshots every screen at 1280 px and 412 px. Claude reads them back and fixes visual problems before calling a UI milestone done.
- **Gate every commit:**
  - unit + full browser suite with `--repeat-each=2`;
  - commit/push **only** if everything passes, checked in the same command;
  - chain with `&&` so a failing test stops the push (v1 pushed a regression when tests and push ran unconditionally).
- **Flaky tests are leads.** Read `test-results/**/error-context.md`. v1 found two real bugs this way.

---

## 12. Milestones (build order)
Each milestone ends with its tests passing, a screenshot review (UI milestones) and a push.

| # | Milestone | Done when |
|---|---|---|
| M0 | **Setup:** fresh repo contents, `CLAUDE.md`, tooling (Node, Playwright Firefox, Python server), vendored libs at verified versions, empty frame live on GitHub Pages, service worker, manifest, icons | Hello-frame live; syntax test and one browser test pass; [NV] items checked |
| M1 | **Core logic (pure):** model, types, mentions, short names, tags, search, kit (schema 3), merge, backup, session rules | Unit tests cover section 4 and 7 rules |
| M2 | **Data layer + components:** Dexie schema, `data/` modules, design tokens, all components from 5.4, toasts, confirm sheet, router with breadcrumbs, top bar | Component gallery page (dev only) renders every component; router tests pass |
| M3 | **Session screen:** capture box, `@` and `#` autocomplete, recall cards, tap-to-link, quick type, feed, character overview, auto-end | Capture specs pass on desktop and at phone width |
| M4 | **World:** hub World panel, type lists, entity page with fields, manage types and fields, merge, delete | Custom type with link field works end to end |
| M5 | **Notes and Inbox:** Notes list with filters (tag/mode/entity), edit/delete, Inbox with all promote actions | Inbox specs pass |
| M6 | **Character:** profile sections, portrait, D&D Beyond link everywhere it shows | |
| M7 | **Relationships:** sentences, inline add, connections diagram (inline SVG, ≤12 nodes), on recall cards | |
| M8 | **Files:** upload rules, viewer, attach, pictures | |
| M9 | **Backup and kits:** export, import New/Merge/Replace, badge, nudge, persist, first run (incl. demo), Help, Settings | Two-device specs pass; demo kit spec passes |
| M10 | **Hardening and release:** CSP, speed check at 5000 notes, error toasts for unexpected failures, offline, accessibility pass, README, release version | All quality bars in section 10 met |

---

## 13. Lessons from v1 (read before coding)
1. **Plan the UI as a system first** (components, one pattern per job). v1's dialogs, inline forms and menus grew piecemeal.
2. **Real-sounding test data finds real bugs.** The messy demo exposed the missing short names on its first run. Build the demo early (M1 data) and use it in tests.
3. **Mentions are the product.** Every edge case in section 4 came from an actual failure.
4. **Merge must be deterministic and order-independent:** stable survivors, canonical JSON, ties resolved by value. Otherwise devices ping-pong.
5. **Don't count merged-in data as unsaved changes,** and don't bump `updated_at` in upgrades that aren't user edits.
6. **Status messages must not shift the page** (taps landed on the wrong thing).
7. **Wait for the state, not the event:** a download starting ≠ "backed up" recorded. Tests waiting on the event raced.
8. **Event listeners attached in effects can miss early events:** re-read state on attach (router).
9. **A typed pick must beat a late caret restore** (typing cancels the pending restore).
10. **Phone keyboards:** act on pointerdown, keep focus in the box, stack results bottom-up, size the app to `visualViewport`.
11. **Field-order differences break byte comparisons:** write canonical JSON.
12. **Same-specificity CSS later in the file wins:** quiet buttons and select widths broke this way. Use component-scoped classes.
13. **htm drops whitespace that contains a newline:** keep text with `${}` on one line (it caused "device:2 notes").
14. **Gate pushes on tests in the same command.** v1 build .31 went live with a regression because the push didn't wait for the test result. (v1 also needed PowerShell workarounds; on Ubuntu `&&` does the job.)
15. **GitHub Pages caches files for 10 minutes:** the network-first service worker plus a visible build number made testing on the phone sane.

---

## 14. Open questions (resolve in M0)
1. **Import v1 kits (schema 1–2)?** Recommendation: no (test data only). Add later if wanted.
2. **Can built-in types be renamed?** Recommendation: yes (label only; ids fixed).
3. **Field kinds:** is `text, long_text, number, date, link, url` enough? Recommendation: yes for 1.0.
4. **"Recent notes" on Home:** last 5, or only notes from the last session? Recommendation: last 5.

---

## 15. Decision log
| Date | Decision |
|---|---|
| 2026-10-01 | v2 replaces v1, built fresh from this spec on a new machine, in the same GitHub repo (v1 kept under tag `v1-final`) |
| 2026-10-01 | Keep: one character per app; capture + `@mentions` + recall; Inbox; relationships + diagram; files; kits |
| 2026-10-01 | Drop: GitHub sync; manual kit export/import is the only device transfer and backup |
| 2026-10-01 | New: tags on notes (`#tag`); built-in + custom entity types with custom fields; D&D Beyond link |
| 2026-10-01 | Navigation: hub (as v1) cleaned up, with breadcrumbs, Home always visible, and a session button in the top bar |
| 2026-10-01 | Confirmations only for destructive actions; everything else edits in place |
| 2026-10-01 | Jake mostly reviews behaviour; code stays clean and conventional, without teaching material |
| 2026-10-01 | Build machine is Ubuntu: python3, Node LTS via nvm, `gh auth login` for GitHub; Windows/PowerShell notes dropped |
| 2026-10-01 | SPEC v2 and the style preview approved by Jake. Section 14 defaults accepted: no v1 kit import, built-in types renamable (label only), field kinds as listed, Home shows the last 5 notes |
| 2026-10-01 | **Visual style: "field journal"** (section 5.4) replaces v1's plain palette: aged paper, sepia ink, ruled lines, red margin, green marks; green darkened to #4F6B47 for AA contrast. Headings in a bundled old-book serif (IM Fell English, fallback EB Garamond); body in system fonts. Wording themed only at signature moments (Pack/Unpack kit, empty states, toasts); all strings in `js/ui/strings.js` |
| 2026-10-01 | M0: library versions checked on npm: latest are still preact 11.0.0, htm 3.1.1, dexie 4.4.6, minisearch 7.2.0, fflate 0.8.3. Vendored ESM builds with their licences in `vendor/licences/`; source-map comments stripped (the maps aren't vendored) |
| 2026-10-01 | M0: font IM Fell English + IM Fell English SC (small caps, for panel headings, as in the style preview). Licence confirmed SIL OFL 1.1 (Igino Marini), in `vendor/fonts/OFL.txt`. Google Fonts' latin-subset woff2: 59 KB and 57 KB (under 100 KB). Legible at 20 px in the M0 screenshots (desktop and phone) |
| 2026-10-01 | M0: D&D Beyond links accept `https://www.dndbeyond.com/` and `https://ddb.ac/` (the site's own share links use `ddb.ac`) |
| 2026-10-01 | M0: CSP is a `<meta>` tag in `index.html`; the inline import map is allowed by its sha256 hash. `tools/csp-hash.mjs` rewrites the hash and a unit test fails if it's stale. Verified in Playwright Firefox 155: the app boots with no violations and an injected inline script is blocked |
| 2026-10-01 | M0: entry module `js/main.js`. Service worker cache `satchel-v2`; activation deletes every other cache, which clears v1's on upgraded devices |
| 2026-10-01 | M0: versioning is `2.N` (Jake: not date-based). `VERSION` in `js/version.js` goes up by 1 on every push, starting at 2.1; the menu shows "Satchel v2.1". No milestone number in it, so there's no confusing "v2.10.3" near release |
| 2026-10-01 | M0: icons drawn as SVG in `tools/make-icons.mjs` and rendered to PNG with Playwright Firefox (no image tools on the Ubuntu machine). `icons/icon.svg` doubles as the favicon; maskable icon keeps the drawing in the middle 78% |
| 2026-10-01 | M0: the v2 IndexedDB database will be named `satchel-v2` (built in M2), so v1 data on Jake's devices is left untouched and v2 can start at db version 1 |
| 2026-10-01 | M0: noted for M2: the red margin should run the full page height (it currently stops where the content ends); handle it with the `visualViewport` app height |
| 2026-10-01 | M1: core modules import the vendored libraries by relative path (`../../vendor/minisearch.mjs`), so the same files run in Node tests and the browser. Extra pure modules beside section 9's list: `text.js` (shared name rules), `json.js` (canonical JSON), `shortnames.js` |
| 2026-10-01 | M1: `@mentions` and `#tags` must start with a letter, so "@5pm", "#1" and "# heading" stay text. `@`/`#` inside URLs are ignored (4.4 asked this for tags; mentions get the same rule) |
| 2026-10-01 | M1: a stored mention's label is the name **as typed** ("@Grimbold" → `@[Grimbold](id)`); the UI still shows the current name. When editing, a name that can't be typed back as an `@token` (e.g. "St. Cuthbert", or "Mira" followed by "-chan") stays in stored form, so the edit can't change which entity it points at |
| 2026-10-01 | M1: recall drops a name match that sits inside a longer one ("lord aldric" brings up Lord Aldric only, not also an entity called "Aldric") |
| 2026-10-01 | M1: **merge ties are settled by value, not "tie keeps local"** (7.2 vs lesson 4): same `updated_at` → a deletion wins, then the larger canonical JSON. "Tie keeps local" made merge(A,B) ≠ merge(B,A), which is the ping-pong lesson 4 warns about |
| 2026-10-01 | M1: merge also folds a single stub into the one real entity with the same name (not only duplicate stubs). A folded stub's `updated_at` is the group's newest time, not "now", so every device produces identical records. Redirects (mentions, relationships, files, link fields, `promoted_to`, the PC) don't touch `updated_at` |
| 2026-10-01 | M1: search requires every word to match (AND), with prefix matching and the 4.5 typo rule; names are boosted ×3 and tags ×2. 5000 notes in Node: index 78 ms, search 5–19 ms |
| 2026-10-01 | M1: uploads: SVG refused (it can carry scripts); 10 MB means 10 MiB. Built-in types have a fixed timestamp so untouched built-ins are identical on every device |
| 2026-10-01 | M1: kits with schema 1–2 (v1) are refused with their own message ("made by Satchel v1"). `importModes()`: empty app → New; same bundle → Merge or Replace; different → Replace |
| 2026-10-01 | M1: demo built early (lesson 2) in `tools/demo-data.mjs`: 47 notes over four Friday sessions in September 2026 (Perth time), 23 entities, 4 stubs (Grimbol typo, Hollow King, Pip, Vex), 12 in the Inbox, an edited note, Deity and Ship types, a text file. The D&D Beyond link points at the generic characters page (not a real person's sheet). A unit test fails if `demo/wren.kit` is stale; `tests/fixtures/schema-3.kit` is a frozen copy |
| 2026-10-01 | M2: contrast re-checked with the WCAG formula. On `--paper` the table's figures hold (ink 11.4, red 5.4, green 5.3). But muted text also sits on `--paper-alt` (panels, top bar), where #7A6A57 is 4.16:1, failing AA. `--ink-muted` darkened to **#736452** (5.07 / 4.56). Muted text never goes on `--highlight` or washes (it fails there); the active picker row and chip × use ink |
| 2026-10-01 | M2: a name-only first run ships now (Unpack a kit and Try the demo join it in M9), so the real top bar can be checked on the phone. The component gallery is at `#/dev/gallery`, localhost only |
| 2026-10-01 | M2: the app is exactly the visual-viewport tall and scrolls inside `.page-scroll` (not the document), so the phone keyboard shrinks the app instead of covering it; the red margin now runs the full page height |
| 2026-10-01 | M2: dates formatted by hand ("26 Sep 21:40", year added when it isn't this year) because ICU versions disagree on "Sep"/"Sept" between Node and Firefox |
| 2026-10-01 | M2: the entity picker offers "New stub: X" only when nothing matches, the same rule as the capture box (4.2) |
| 2026-10-01 | M2: saves compare records ignoring `updated_at`, so re-saving unchanged data is a no-op and doesn't count as a change. Profile edits stamp `profile_times` per changed section |
