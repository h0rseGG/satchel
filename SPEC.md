# Satchel v3: specification

Status: **APPROVED 2026-10-02** by Jake. This file is now the source of truth; it supersedes the kickoff brief (`V3-KICKOFF.md`, kept for history). Change it only with Jake, and log every change in section 15.
v2 is kept at git tag `v2-final` (read-only reference via `git show`). Sections 4 and 13 are ported from v2 word for word; v3 changes to them are in 4.6 and in the notes under 13.

Legend: **[NV]** = not verified; check before relying on it. **(v2)** = proven in v2, keep as is.

---

## 0. How to use this document

1. Read sections 1–3, then section 13 (lessons) **before writing any code**.
2. Build in the phase order of section 12. Every phase has a gate; don't start the next until it passes.
3. Log every decision in section 15 (decision log), with the date.
4. Owner: Jake. Working preferences are in `CLAUDE.md`: blunt, concise, AU English, end every reply with a **Next step**, ask at most 3 questions at a time.

---

## 1. Product

**Satchel** is a player's companion for one D&D character. No stats, dice, accounts or server (D&D Beyond does the mechanics).

### Principles
1. **Two moments, one app.**
   - **At the table:** one box. Type, press Enter, done. Speed beats everything.
   - **Afterwards (optional):** Review the session's notes, confirm links and candidates, tidy entities. Nothing is lost if you never tidy.
2. **Nothing gets lost.** Every save is durable the moment Enter is pressed. Destructive actions are confirmed. Backups are one action (Pack kit).
3. **Real notes are messy.** Shorthand, typos, first names, swearing. Names link themselves as you type; `@` is only for new names or to pick between two (section 4).
4. **Notes stay notes.** Entity pages show backlinks (every note that mentions them) and pinned notes. Notes are never copied into descriptions.
5. **Boring, planned, consistent.** One way to do each kind of thing.

### User
Jake, on Windows 11 (mostly the Framework laptop). Single user, single machine at a time; a second machine just unpacks a kit.

### Non-goals
- Stats, mechanics, dice, character sheets.
- Accounts, servers, sync, automatic backups or snapshots.
- Merge of any kind (no tombstones, no merge rules). Moving data = Replace.
- Phone, browser, macOS, Linux as targets (Linux is the build/test machine only).
- v2 `.kit` import (different format; no real v2 data exists).
- Rendering Markdown.

---

## 2. Platform and stack

| Need | Choice | Notes |
|---|---|---|
| Language | **Python 3.14** | Newest Python that current PySide6 supports (6.11.2: `requires_python >=3.10,<3.15`; wheels are `cp310-abi3`, incl. `win_amd64`). Checked on PyPI 2026-10-02. Pinned in `pyproject.toml` and `.python-version` |
| UI | **PySide6, Qt 6 Widgets** (not QML) | Added in P1; P0 has no UI |
| Env / run | **uv** | `uv sync`, `uv run ...` |
| Lint | **ruff** | `uv run ruff check` |
| Tests | **pytest + Hypothesis** (+ pytest-qt from P1) | |
| Storage | stdlib **`sqlite3`**, one file per character, **FTS5** search, numbered SQL migrations via `PRAGMA user_version`. No ORM | Verified 2026-10-02 on the Windows 11 laptop (uv-managed Python 3.14): SQLite 3.53.1, FTS5 and STRICT work; full test suite passes |
| Images | **Pillow**, re-encoded to WebP, stored as BLOBs in the same file | P2 |
| Global hotkey | Win32 `RegisterHotKey` via ctypes + `QAbstractNativeEventFilter` | P1, Windows only |
| Fonts | IM Fell English / IM Fell English SC (OFL) for headings, Segoe UI Variable for everything else | See 5.3 |

**Files on disk**
- Live databases: `%LOCALAPPDATA%\Satchel\<character>.satchel` (one per character).
- Replaced databases: `%LOCALAPPDATA%\Satchel\replaced\` (kept by Unpack → Replace).
- Machine-local state (never packed): `%LOCALAPPDATA%\Satchel\local.json` with `last_packed_at` per `character_id`, window geometry, hotkey.

---

## 3. Data model

One SQLite file = one character. All ids are UUID v4 text (the demo uses stable ids derived from keys). Times are ISO 8601 UTC text (`2026-09-05T11:40:00.000Z`), shown in local time, en-AU. Deletes are real deletes (no tombstones); `PRAGMA foreign_keys = ON`.

### 3.1 Tables (migration 0001)
| Table | Columns | Notes |
|---|---|---|
| `meta` | `key` PK, `value` | `character_id`, `character_name`, `pc_entity_id`, `dndbeyond_url`, `app_version_created` |
| `types` | `id` PK, `label`, `plural`, `person` (0/1), `builtin` (0/1), `sort_order`, `created_at`, `updated_at` | Built-ins have fixed ids: `type-npc`, `type-location`, `type-faction`, `type-item`, `type-character`, `type-thread`, `type-other`. People: npc, character |
| `type_fields` | `id` PK, `type_id` → types, `label`, `kind` (`text`, `long_text`, `number`, `date`, `link`, `url`), `link_type`, `removed` (0/1), `sort_order` | Removing a field keeps it, marked removed, so re-adding restores values (v2) |
| `entities` | `id` PK, `type_id` → types (null = untyped), `name`, `summary`, `body`, `is_candidate` (0/1), `thread_state` (`open`/`closed`/null), `portrait_file_id`, `created_at`, `updated_at` | A **candidate** is a name typed with `@` that matched nothing (4.6). Threads are entities of `type-thread` with `thread_state` set |
| `entity_aliases` | `entity_id` → entities, `alias` | PK (entity_id, alias) |
| `entity_tags` | `entity_id` → entities, `tag` | Lower-case keys |
| `field_values` | `entity_id`, `field_id`, `value` | PK (entity_id, field_id) |
| `sessions` | `id` PK, `number` UNIQUE, `date` (local date), `title`, `recap`, `created_at`, `updated_at` | A record, not a mode |
| `notes` | `id` PK, `text`, `session_id` → sessions (null = between sessions), `reviewed_at` (null = unreviewed), `original_text` (first version, set on first edit), `created_at`, `updated_at` | Text holds stored tokens `@[label](id)` and typed `#tags` |
| `note_links` | `note_id` → notes, `entity_id` → entities, `how` (`typed`/`auto`/`confirmed`) | PK (note_id, entity_id). Derived from the tokens in `text`; only `how` isn't derivable (4.6) |
| `note_tags` | `note_id`, `tag` | Derived from `#tags` |
| `pins` | `entity_id`, `note_id`, `created_at` | Pinned notes on an entity page |
| `relationships` | `id` PK, `from_id`, `to_id` → entities, `type`, `directed` (0/1), `notes`, `created_at`, `updated_at` | (v2) suggested types |
| `files` | `id` PK, `entity_id` (null ok), `name`, `kind` (`image`/`text`), `mime`, `size`, `width`, `height`, `caption`, `data` BLOB, `created_at`, `updated_at` | |
| `profile` | `section` PK, `text`, `updated_at` | The player character's sections: concept, backstory, personality, ideals, bonds, flaws, goals, appearance, notes |
| `notes_fts` | FTS5 (`note_id` UNINDEXED, `body`) | Plain text (mentions as labels), written by `satchel.db` on every note save |
| `entities_fts` | FTS5 (`entity_id` UNINDEXED, `name`, `aliases`, `tags`, `summary`, `body`) | |

Deleting an entity cascades its links, aliases, tags, values and pins. Notes keep the stored token; the UI shows its label as a dashed (missing) chip, as v2 did.

### 3.2 Migrations
- `src/satchel/db/migrations/NNNN_name.sql`, applied in order, each in one transaction, then `PRAGMA user_version = NNNN`.
- A file with `user_version` newer than the app knows is **refused** (never opened read-write).
- Never edit a shipped migration; add a new one. Upgrades don't bump `updated_at` (lesson 5).
- Every schema version gets a frozen fixture database in `tests/fixtures/` that must still migrate.

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

### 4.6 v3 changes to section 4 (these override 4.1–4.5 where they differ)
Sections 4.1–4.5 above are v2's text, kept word for word as the reference. v3 differs as follows.

0. **v2 refinements carried over** (from v2's decision log, covered by its tests): `@mentions` and `#tags` must start with a letter ("@5pm", "#1" stay text); `@`/`#` inside URLs are ignored; a stored label is the name as typed; when editing, a name that can't be typed back as an `@token` (e.g. "St. Cuthbert", or "Mira" followed by "-chan") stays in stored form; recall drops a match inside a longer one; a mention displays what was typed while it's still one of the entity's names (a run of words of its name, or an alias), otherwise the current name.
1. **Candidates replace stubs.** Resolution step 4 ("Otherwise a new stub") creates a **candidate**: an entity row with `is_candidate = 1`, no type. Candidates are listed in Review to accept (pick a type, or merge into an existing entity by re-pointing links) or dismiss. Everything 4.1–4.3 says about stubs applies to candidates: they count as people for short names, lose to a real entity on an exact-name tie, and one candidate is made per name per save.
2. **Names auto-link without `@`.** On save, plain-text occurrences of known names, aliases and short names (the same matcher as recall, 4.5) become stored tokens with `how = auto`. `@` is only needed for a new name or to choose between two entities with the same name. The player character is never auto-linked (typed `@Wren` still links).
3. **Candidates are matchable.** Once a candidate exists, later plain-text uses of its name auto-link to it.
4. **Auto-link never creates anything.** Only a typed `@token` can create a candidate.
5. **Stored labels.** A typed token's label is the name as typed (v2). An auto token's label is the exact matched text, so removing every token's markup gives back exactly what was typed.
6. **`note_links`.** One row per (note, entity). `how` = `typed` if any token for that entity was typed with `@` (or picked), else `auto`; Review sets `confirmed`. The set of entity ids in `note_links` always equals the set of ids in the note's tokens whose entity still exists (tested invariant; a deleted entity's token stays in the text as a missing chip, with no link row).
7. **Editing.** Typed and confirmed links show in typed form (`@Lord_Aldric`), pinned to their entity with picks (4.1). Auto links show as their plain label and are re-matched on save. Tokens whose entity is gone stay in stored form (4.1).
8. **Matcher speed.** Per keystroke: active-token suggestions + name matching on the capture text in **< 10 ms** with 5000 notes and 300 entities.
9. **Recall cards, autocomplete and the capture box** are rebuilt in Qt in P1. The browser/phone parts of 4.2 and 4.5 (pointerdown, phone keyboard, `visualViewport`, bottom-up stacking for the keyboard) don't apply. "Tap" means click.
10. **Refinements found while porting (2026-10-02, most by Hypothesis fuzzing):**
    - A stored token counts as a word for the `@`/`#` start rule, so "grimbold@x" (no mention) can't turn into one once "grimbold" is auto-linked.
    - A typed `@token` or `#tag` that touches a URL is part of the URL ("@https://x.com" isn't a mention of "https").
    - A stored label never contains `[` or `]` (they were always stripped), and the stored pattern refuses them, so a stray "@[" before a token isn't swallowed.
    - Auto-link: overlapping hits keep the earliest, then the longest ("mira vane street" with Mira Vane and Vane Street links Mira Vane). Names containing `[` or `]` aren't auto-linked.
    - A candidate made by a typed `@token` is matchable in the rest of the same note ("@Pip sells info. pip is a kid" links both).
    - Editing: an auto link whose label no longer names its entity (it was renamed) stays in stored form, so the link isn't lost. A token keeps its stored form when "@Name" wouldn't read back in its spot (straight after a word character or another token).
    - Confirmed links stay confirmed through an edit. A stored token that passes through a save untouched keeps its previous kind.
11. **Titles never become short names** (overrides 4.3; Jake, 2026-10-02). Auto-link stores links, so an everyday title ("my lord", "the guard captain", "oh brother") would link to whichever person happens to be the only one holding it. Fixed list in `core/shortnames.py` (`TITLE_WORDS`): nobility (lady, lord, dame, king, queen, prince/princess, duke/duchess, baron/baroness, count/countess, earl, emperor/empress), military (captain, sergeant, commander, general, admiral, lieutenant, marshal), family and religious (sister, brother, father, mother, master, mistress, elder, saint, bishop, abbot/abbess, priest/priestess). To make a title link on purpose, add it as an **alias** (the demo's Hollow King has the alias "King").

---

## 5. Windows, views and look

### 5.1 Views (P1 unless noted)
| View | Contents |
|---|---|
| **Table** (P1) | The capture box (one line, Enter saves), live highlighting of links and tags as you type, autocomplete for `@` and `#`, the recall panel (4.5), the current session's notes (newest at the bottom). Click a note to edit it in the capture box (Enter saves, Esc cancels); no delete until Review. Session strip: number, date, title; Start session / End session |
| **Characters** (P1) | Start opens the last character (`local.json`). First run: a small "New character / Unpack kit" screen. *File › Open character* lists `%LOCALAPPDATA%\Satchel\*.satchel` |
| **Quick capture** (P1) | Global hotkey opens a small always-on-top capture box; Enter saves into the current (or no) session; Esc closes. Tray icon: open, quick capture, pack kit, quit |
| **Review** (P2) | Replaces v2's Inbox. Per session: unreviewed notes, auto links to confirm or remove, candidates to accept/dismiss. Mark session reviewed. Target: < 2 min per session |
| **Entity page** (P2) | Name, type, aliases, tags, summary, body, fields, thread state, relationships, files, **pinned notes**, **backlinks** (every note linking it, newest first) |
| **Palette** (P2) | Ctrl+K: jump to any entity, session or command |
| **Character** (P2) | Profile sections, portrait, D&D Beyond link |

### 5.2 Interaction rules (from v2 5.3, desktop)
1. **Edit in place:** fields autosave 0.7 s after typing stops and on leaving the field; saving the same value is a no-op; outside updates never overwrite a focused field.
2. **One confirm dialog**, only for destructive actions: delete, Replace, delete type.
3. **One inline-form pattern** for multi-field adds (relationships, fields).
4. **One entity picker** used everywhere. New names typed into a picker create a candidate.
5. **Buttons:** primary (one per area), secondary, quiet, danger.
6. **Labels:** types in title case; counts with singular/plural ("1 note", "2 entities").
7. **Messages never shift the layout** (lesson 6). The end-of-session nudge (7.3) is a non-blocking bar, not a dialog.

### 5.3 Visual system: "field journal" (ported from v2 5.4)
An adventurer's field journal: ink on aged paper, ruled lines, a red margin, sparing marks in red and green.

**Palette.** Only these colours; never invent others. Defined once in `src/satchel/ui/palette.py` and substituted into the single QSS file (`src/satchel/ui/satchel.qss`) at load (QSS has no variables). Contrast against `paper` (WCAG; v2 checked).

| Name | Value | Use | Contrast |
|---|---|---|---|
| `paper` | #F6F1E4 | Window background | |
| `paper-alt` | #EDE5D2 | Panels, cards, toolbars | |
| `rule` | #D8CDB6 | Borders, ruled lines, dividers | |
| `ink` | #3B3026 | Body text, primary buttons (ink fill, paper text) | ~11.4:1 |
| `ink-muted` | #736452 | Secondary text, timestamps, hints | 5.1:1 on paper, 4.6:1 on paper-alt. Never on highlight or washes |
| `red` | #9C4A3A | Margin line, danger, focus ring | ~5.4:1 |
| `green` | #4F6B47 | "Done/packed" marks | ~5.3:1 |
| `wash-ok` | #DCE5D3 | Success background | |
| `wash-warn` | #EED9AE | Warning background | |
| `wash-err` | #E9C9BF | Error background | |
| `highlight` | #E2D3B0 | Link chips (1 px `ink-muted` underline), selected rows | |

- Washes are backgrounds with `ink` text; never wash colours as text. No dark mode.

**Type**
- **Headings** (window/page titles, panel headings, app name): **IM Fell English**; panel headings in **IM Fell English SC** (small caps). SIL OFL 1.1; files and `OFL.txt` in `src/satchel/ui/fonts/`, loaded with `QFontDatabase.addApplicationFont`. Fallback: Georgia, serif.
- **Body, notes, inputs, buttons:** **Segoe UI Variable** (Windows 11 system font). Qt family names (verified on the laptop 2026-10-02): use **`Segoe UI Variable Text`** for body, notes, inputs and buttons, and `Segoe UI Variable Small` for captions and small labels. The Display, Light, Semilight and Semibold families exist but aren't used without a reason.
- Qt family names for the headings (verified): `IM FELL English` and `IM FELL English SC`.
- **Numbers are never set in the serif** (its old-style figures make "11" read as "II"). Counts, dates and times in headings use the body font.
- **Scale:** 12/13/14/16/20/26 px. Headings 20 px (panels, small caps) and 26 px (page titles).

**Shapes and detail**
- Corner radius 3 px; no pill buttons.
- **Ruled lines:** lists and the notes feed have a 1 px `rule` line under each row.
- **Red margin:** a 1 px `red` vertical line down the left of the page content.
- **Buttons:** primary = `ink` fill, paper text; secondary = ink outline; quiet = text only, underlined on hover; danger = `red` outline (`red` fill inside the confirm dialog).
- **Links:** typed and confirmed links show as a `highlight` chip; auto links have no fill, only a 1 px `ink-muted` underline; a missing entity's token is `ink-muted` italic. **Tags** are small `ink-muted` text with a leading `#`.
- **Focus:** 2 px `red` outline. **Icons:** few, line style in `ink`. No emoji in the chrome.
- **Spacing:** 4/8/12/16/24 px.

**Wording: light touch.** Plain labels where clarity matters; the theme at signature moments. All user-facing text in one `src/satchel/ui/strings.py`.

| Where | Text |
|---|---|
| Export / import | **Pack kit** / **Unpack kit** |
| Pack done | "Kit packed: wren-ashdown-2026-10-01-2130.kit" |
| Empty notes | "Your satchel is light. Type below and press Enter." |
| Review empty | "Nothing loose. Every page is filed." |
| Empty files | "No maps or scraps yet." |
| End-of-session nudge | "Session over. Pack your kit before you go?" |

---

## 6. Sessions
- A session is a record: `number` (auto-increments), `date`, `title`, `recap`.
- **Start session** creates the next record and makes it current; notes captured while it's current get its `session_id`. **End session** clears "current". No global in/out mode, no auto-end.
- Notes captured with no current session have `session_id = null` ("between sessions").
- Sessions can be edited (title, recap, date) and notes moved between sessions in Review.

---

## 7. Kits: backup and moving machines (P1)
No automatic snapshots or sync. Backups and moving between machines are manual.

### 7.1 Pack kit
Exports one character to `<slug>-YYYY-MM-DD-HHmm.kit` (ASCII slug of the character name, local time), saved wherever Jake chooses. A zip holding:
```
manifest.json     format "satchel", schema_version, character_id, character_name, exported_at, app_version
character.satchel a consistent copy of the database made with VACUUM INTO
```
Then records `last_packed_at` in `local.json`.

### 7.2 Unpack kit
Validate first, change nothing until valid:
- not a zip / no `manifest.json` / bad JSON / `format` ≠ "satchel" / no database → refuse;
- `PRAGMA integrity_check` ≠ ok → refuse;
- schema newer than the app → refuse ("made by a newer Satchel"); older → migrate the unpacked copy.

Then offer:
- **Add as new character** (always; if the `character_id` already exists locally, the copy gets a new `character_id`).
- **Replace** (only for the same `character_id`): confirm; warn if the local copy has edits newer than the kit's `exported_at`; move the old file to `replaced/<slug>-<timestamp>.satchel`; then swap in.

### 7.3 End-of-session nudge
Ending a session with changes since `last_packed_at` (any `updated_at` later than it) shows a non-blocking bar: "Session over. Pack your kit before you go?" with **Pack kit** and **Not now**. Never a confirm, never blocks closing. No badge.

---

## 8. Demo character
- **Wren Ashdown**, ported from `v2-final:tools/demo-data.mjs` to `tests/fixtures/demo.py` (data as Python literals). A builder runs every note through the v3 resolver (typed tokens, auto links, candidates) and writes a `.satchel` database via `satchel.db`, so building the demo exercises the parser and the schema.
- A month of real-sounding table notes over four Friday sessions in September 2026 (Perth time): typos, shorthand, swearing, emoji; `#debts`, `#do_NOT_trust`, `#fuck_this_guy`.
- **Expected counts (G0):** 47 notes; 23 entities, 4 of them candidates (Grimbol typo, Hollow King, Pip, Vex); 12 unreviewed notes. Also 9 types (7 built-in + Deity with a Domain field, Ship with a Captain link field), 9 relationships, 1 text file, 4 sessions, one edited note.
- v2 "promoted" notes become **pins** on the entity; v2 in-session notes get the session of their date.
- Stable ids from keys (`sha256("satchel-demo:" + key)` shaped as a UUID, as v2).
- Built by replaying entity creations, session starts, notes and the one edit **in time order**, so a note only auto-links to entities that existed when it was typed (e.g. 6 Sept "the hollow" doesn't link Hollow King, first typed 12 Sept).
- Built per test run by the `demo_path` fixture (`tests/conftest.py`); there is no committed demo file in P0. A test rebuilds it and checks every row is identical.

---

## 9. Code structure
```
pyproject.toml  .python-version  uv.lock  SPEC.md  CLAUDE.md
src/satchel/
  core/     pure logic: no Qt, no sqlite. text.py tags.py shortnames.py mentions.py display.py autocomplete.py matcher.py model.py
  db/       the only code that touches SQLite: connection.py migrate.py entities.py notes.py migrations/NNNN_*.sql
  files/    (P1) plain file I/O outside the database: local.json, kit zips
  ui/       (P1) Qt Widgets; palette.py strings.py satchel.qss fonts/
tests/      unit tests per core module, db tests, property tests, perf tests; fixtures/demo.py
tools/      one-off scripts (font conversion, frozen schema fixtures)
```
**Rules:** core is pure; only `satchel.db` touches the database; every write goes through `satchel.db` in a transaction; comments explain *why* at low-to-medium detail (Jake reads the code); a file over ~300 lines gets split.

---

## 10. Quality bars
| Area | Target |
|---|---|
| Typing | Matcher < 10 ms per keystroke at 5000 notes / 300 entities (P0); no visible lag (P1) |
| Saving | Capture save < 50 ms (P1, G1) |
| Search | FTS5 query < 50 ms at 5000 notes |
| Data safety | Every save durable on Enter; every unpack validates first; Replace keeps the old file; no destructive action without a confirm |

---

## 11. Testing strategy
- **pytest** for every core rule: every section 4 rule (as amended by 4.6) has a test; every `v2-final:tests/unit/mentions.test.js` case is a pytest case.
- **Hypothesis** fuzzes the parser: no crashes on any text, spans in bounds and non-overlapping, resolve is idempotent, the edit round trip keeps links, stripping tokens gives back the typed text.
- **DB tests** on temporary files: migrations from zero and from every frozen fixture, refusal of newer schemas, FTS kept in step, `note_links` invariant.
- **Demo test:** builds the demo database and checks the counts in section 8.
- **Perf test:** synthetic 5000 notes / 300 entities; matcher median < 10 ms.
- **Gate every commit:** `uv run ruff check && uv run pytest && git commit ... && git push` (one `&&` chain; lesson 14).
- Tests use fixtures and the demo only, never Jake's data.

---

## 12. Phases
| Phase | Scope | Gate (done when) |
|---|---|---|
| **P0 Foundations** | uv project skeleton, SPEC + CLAUDE.md, core rules (mentions, short names, tags, auto-link matcher) as pure Python, SQLite schema + migrations, demo fixture. **No UI** | **G0:** every section 4 rule passes as pytest; Hypothesis fuzzes the parser; the demo loads with the expected counts (47 notes, 23 entities, 4 candidates, 12 unreviewed); matcher < 10 ms per keystroke at 5000 notes / 300 entities |
| P1 Table MVP (on Windows) | Main window, Table view, capture bar, live highlighting + autocomplete, recall panel, sessions, tray + hotkey, Pack/Unpack kit + nudge | **G1:** one real session, no lost notes, save < 50 ms |
| P2 Desk | Review, backlink entity pages, types/fields/threads, relationships + graph, files, palette | **G2:** review < 2 min per session |
| P3 Optional | Markdown export, phone drop-folder, local-LLM recap, single .exe | Only if G2 shows a need |

Don't start P1 on the Ubuntu machine: hotkey, tray and the real UI need Windows.

---

## 13. Lessons from v1 (read before coding)
1. **Plan the UI as a system first** (components, one pattern per job). v1's dialogs, inline forms and menus grew piecemeal.
2. **Real-sounding test data finds real bugs.** The messy demo exposed the missing short names on its first run. Build the demo early (M1 data) and use it in tests.
3. **Mentions are the product.** Every edge case in section 4 came from an actual failure.
4. **Merge must be deterministic and order-independent:** stable survivors, canonical JSON, ties resolved by value. Otherwise devices ping-pong.
5. **Don't count merged-in data as unsaved changes,** and don't bump `updated_at` in upgrades that aren't user edits.
6. **Status messages must not shift the page** (taps landed on the wrong thing).
7. **Wait for the state, not the event:** a download starting ≠ "backed up" recorded. Tests waiting on the event raced.
9. **A typed pick must beat a late caret restore** (typing cancels the pending restore).
11. **Field-order differences break byte comparisons:** write canonical JSON.
12. **Same-specificity CSS later in the file wins:** quiet buttons and select widths broke this way. Use component-scoped classes.
14. **Gate pushes on tests in the same command.** v1 build .31 went live with a regression because the push didn't wait for the test result. (v1 also needed PowerShell workarounds; on Ubuntu `&&` does the job.)

v3 notes on section 13: lessons 8, 10, 13 and 15 were browser-specific and are left out (numbering kept). Lessons 4, 5 and 11 were about merge and kits; v3 has no merge, but 5 (don't bump `updated_at` in upgrades) and 11 (canonical JSON in `manifest.json`) still apply. Lesson 12 applies to QSS too.

---

## 14. Open questions
None open. Resolved 2026-10-02 (see section 15):
1. ~~Candidates: entity rows or a separate table?~~ Entity rows with `is_candidate = 1`.
2. ~~Auto links: tokens in the text or derived at render?~~ Stored tokens in the text, `how = auto` in `note_links`.
3. ~~Fonts: woff2 or TTF?~~ TTF from the start, converted with fontTools from the v2 woff2.

---

## 15. Decision log
| Date | Decision |
|---|---|
| 2026-10-02 | v3 replaces v2: native Windows desktop app in Python + PySide6 (Widgets), one SQLite file per character. v2 kept at tag `v2-final` (approved kickoff brief) |
| 2026-10-02 | Python **3.14**: PySide6 6.11.2 (current) supports `>=3.10,<3.15` with `cp310-abi3` wheels for win_amd64. Dev tools at P0: pytest 9.1, hypothesis 6.168, ruff 0.16. PySide6, pytest-qt and Pillow are added in P1/P2 when first used |
| 2026-10-02 | Dropped from v2: merge, tombstones, backup badge, automatic backups, in/out mode and auto-end, service worker, CSP, phone/browser workarounds, GitHub Pages, v2 kit import |
| 2026-10-02 | Review replaces Inbox (`notes.reviewed_at`); v2 "promote to" becomes pins; v2 note `mode` becomes `session_id` |
| 2026-10-02 | Built-in types add `type-thread` (open/closed via `entities.thread_state`) |
| 2026-10-02 | Candidates are entity rows (`is_candidate = 1`), not a separate table: links, aliases and accept/merge in Review work on one table (Jake approved) |
| 2026-10-02 | Auto links are stored tokens in the note text with `how = auto`, not derived at render: links survive renames and `note_links` can be rebuilt from the text (Jake approved) |
| 2026-10-02 | Fonts ship as TTF converted from the v2 woff2 with fontTools; Qt's woff2 support on Windows is [NV] and can't be tested from Ubuntu (Jake approved) |
| 2026-10-02 | Dev tools pinned as minimums in the `dev` dependency group: pytest 9.1, hypothesis 6.168, ruff 0.16, fonttools[woff] 4.60 (for the font conversion tool and font test). Build backend `uv_build` |
| 2026-10-02 | Regex: stdlib `re`, no third-party `regex`. `\w` on `str` is v2's `[\p{L}\p{N}_]`; "starts with a letter" is `str.isalpha()` after matching |
| 2026-10-02 | Typing-rule refinements found by porting and fuzzing are listed in 4.6.10 (stored token counts as a word; URL-touching tokens; bracket-free labels; auto-link overlaps; same-note candidates; edit fallbacks) |
| 2026-10-02 | Core API: `resolve_note()` (matcher.py) is the single pure "what happens on save": typed tokens, candidates, auto-link, link kinds, tags. `satchel.db` calls it and writes the result |
| 2026-10-02 | Schema 0001: STRICT tables; CHECK constraints on enums and 0/1 flags; built-in types seeded by the migration (a test checks they match `core.model`); files `ON DELETE SET NULL` (a file outlives its entity), entity type `ON DELETE RESTRICT` |
| 2026-10-02 | Connections: `sqlite3.connect(autocommit=True)` + our own `transaction()` (BEGIN IMMEDIATE/COMMIT/ROLLBACK), so Python's implicit transactions never surprise us. WAL + `synchronous=FULL` for durable saves. Newer files are checked through a read-only connection and refused before any write |
| 2026-10-02 | FTS rows keyed by `note_id`/`entity_id`, not rowid: VACUUM (and so VACUUM INTO for kits) may renumber rowids of text-keyed tables. Note search body = plain text with display labels. [Open for P2: renaming an entity leaves note search rows with old labels until the note is re-saved] |
| 2026-10-02 | `satchel.db` split into `entities.py` and `notes.py` instead of one `repo.py` (300-line rule) |
| 2026-10-02 | Frozen fixtures: `tools/make_frozen_fixture.py` writes `tests/fixtures/schema_NNNN.satchel` once per schema version (refuses to overwrite); a test requires one per version and migrates a copy of each |
| 2026-10-02 | `mark_reviewed` sets `reviewed_at` only; it doesn't confirm links or bump `updated_at` (lesson 5). Whether reviewing a note confirms its links is a P2 question |
| 2026-10-02 | Demo: replayed in time order through the real save path; ids from stable keys (`candidate:<name key>` for candidates); four sessions, one per Friday, started at the first in-session note; v2 "out" notes have no session. v2's "committed kit is up to date" and "rebuild merges cleanly" tests become "rebuild gives identical rows" (no kit format or merge in P0) |
| 2026-10-02 | Demo auto-link review: titles count as short names when only one person has them (v2 rule), so "my lord daddy" links Lord Aldric and "the King" links Hollow King. Raised with Jake; superseded by the next entry |
| 2026-10-02 | Fonts: `tools/convert_fonts.py` reads the woff2 from tag `v2-final` and writes `src/satchel/ui/fonts/IMFellEnglish-Regular.ttf`, `IMFellEnglishSC-Regular.ttf` and `OFL.txt` (format conversion only; the OFL header declares no Reserved Font Name). Loading via `QFontDatabase.addApplicationFont` is checked at P1 on Windows. The built wheel includes the migrations and fonts (checked with `uv build`) |
| 2026-10-02 | Search (4.5) on FTS5 without a fuzzy library: each typed word matches as a prefix OR any indexed word within the typo limit (plain Levenshtein, swap = 2). The indexed words come from a per-connection `temp` fts5vocab table (no migration). Pure rules in `core/search.py`; a length + letter-set filter (proved safe by a Hypothesis test against brute force) keeps it at ~7 ms for a 5000-note vocabulary |
| 2026-10-02 | Note search text indexes a mention by its label and the entity's full name (v2), so "vane" finds a note that says "mira" |
| 2026-10-02 | Windows check (Framework laptop, uv-managed Python 3.14): all tests pass; SQLite 3.53.1 with FTS5 and STRICT tables. Qt font loading still to confirm |
| 2026-10-02 | Windows font check (`tools/check_qt_fonts.py`): Qt loads both TTF heading fonts (`IM FELL English`, `IM FELL English SC`); Segoe UI Variable present in Text/Small/Display optical sizes. Body uses `Segoe UI Variable Text`, small labels `Segoe UI Variable Small` (5.3). All P0 Windows [NV]s cleared |
| 2026-10-02 | **Option B (Jake):** titles never become short names (4.6.11, `TITLE_WORDS`); aliases are the deliberate override. Rejected: A, keep the v2 rule (false stored links, and dismissals aren't sticky until P2); C, short names for suggestions only (loses most auto links). Demo: Hollow King gets the alias "King" after session 3, so "the King" still links; "my lord daddy" no longer links Aldric. New `db.entities.add_alias` (bumps `updated_at`, rewrites the search row) |
| 2026-10-02 | **SPEC approved** by Jake; it now supersedes `V3-KICKOFF.md`. P0 closed at G0 |
| 2026-10-02 | Build machine moves to the Windows 11 laptop (`C:\Users\h0rse\playground\satchel`) from P1 on, so Claude can run the real UI, tray and hotkey. `.gitattributes` added: LF line endings in the repo on both machines, binaries never converted |
| 2026-10-02 | **P1 plan approved (Jake).** Tasks: deps; session/recall/kit data in `satchel.db`; kits without UI; UI foundation; main window; CaptureBox; notes feed; recall panel; session strip; tray + hotkey + Quick capture; Pack/Unpack UI + nudge; G1. UI system: a `CharacterStore` QObject is the only owner of the connection and emits change signals; one component per job (`kind` property buttons, fixed-height `MessageBar`, `confirm_destructive`, `CaptureBox` shared by Table and Quick capture, overlay `SuggestionList`, `note_html` renderer, `RecallCard`, `AutosaveLineEdit`) |
| 2026-10-02 | Approved with the plan: characters open/create flow (5.1); minimal note edit in P1, no delete; auto-link look (5.3); window close hides to the tray; default hotkey Ctrl+Alt+N kept in `local.json` ([NV] clashes; a failed registration is reported in the message bar); caret moves are synchronous, never on a timer (lesson 9); `last_packed_at` is recorded only after the kit is written and re-read (lesson 7) |
| 2026-10-02 | Deps: `pyside6-essentials` 6.11.2 (QtCore/Gui/Widgets/Network; the full `pyside6` adds the large Addons, e.g. WebEngine, which Satchel doesn't use) and `pytest-qt` 4.5.0 (dev) |
| 2026-10-02 | P1 task 2 (data for the Table view): the current session is the meta row `current_session_id` (in the file, so it survives a crash or restart and travels in a kit; no migration). `start_session` moved to new `db/sessions.py` and now makes the session current (SPEC 6); `end_session` clears it without bumping anything. The demo ends its last session, so it opens between sessions. New: `current_session`, `list_sessions` (newest first), `set_session_title` (same value = no-op, 5.2.1), `session_notes` (oldest first; `None` = between sessions, optional `since`), `notes_by_id` (one loader for feed, recall and search; ids passed as one JSON array to avoid the placeholder limit), `note_tag_counts`, and `db/recall.py` `recall_facts` (mention count, first mention, last 3, up to 3 relations with direction). Dataclasses `Session`, `NoteRow`, `Relation`, `RecallFacts` in `core/model.py` |
| 2026-10-02 | Nudge input `latest_change_at`: MAX of every `updated_at`, plus `reviewed_at` (a review is worth packing) and pin `created_at`. Not seen: meta edits (character name) and deletes; neither exists in P1. [Open for P2: timestamp those when the Character view and deletes arrive] |
| 2026-10-02 | Save speed checked on Windows: a real `save_note` (WAL + `synchronous=FULL`) into a 5000-note / 300-entity file takes median 11.4 ms, max 28.5 ms (G1 target < 50 ms). Kept as a perf test |
| 2026-10-02 | P1 task 3 (kits, no UI). Layers: `core/kit.py` (pure: `slugify`, `kit_filename`, `replaced_filename`, canonical `manifest_json`, `parse_manifest`, `KitError` with a `code` the UI turns into words); `db/kit.py` (`vacuum_into`, read-only `read_identity` / `integrity_ok` / `changed_since`, `upgrade_file`, `set_character_id`); new `satchel/files/` (`local_state.py`, `kits.py`), which never imports sqlite3 (tested) |
| 2026-10-02 | Checked on Windows (SQLite 3.53.1): a `VACUUM INTO` copy is one file in rollback-journal mode, and both it and a closed WAL-mode live file open read-only with no side files left behind |
| 2026-10-02 | Pack: build in a temp folder beside the destination (so the final rename stays on one drive), zip, read back through `open_kit`, then rename into place; the caller records `last_packed_at` after that (lesson 7). Unpack checks, in order: zip, manifest present / UTF-8 JSON / `format` / fields, database present, readable SQLite, schema not newer, `integrity_check`, manifest `character_id` = database `character_id` (added: `mismatch`); older schemas migrate the extracted copy. Only the fixed member names are read, so zip paths can't escape. Add as new: `<slug>.satchel`, then `-2`, `-3`; a new `character_id` only if that id is already in the folder. Replace: the caller confirms and closes its connection; the old file (and any -wal/-shm) moves to `replaced/<slug>-YYYY-MM-DD-HHmmss.satchel` (seconds added so two Replaces in a minute can't collide), the new one goes in, and the old one goes back if that fails |
| 2026-10-02 | `local.json`: `last_packed_at`, `last_character` (file name), `window_geometry`, `hotkey` (default Ctrl+Alt+N). Written via a temp file + rename; an unreadable file is moved to `local.json.bad` and defaults are used (it holds conveniences, not data) |
| 2026-10-03 | P1 task 4 (UI foundation): `ui/palette.py` (colours, spacing, sizes, font names), `ui/strings.py` (all words, incl. one message per `KitError` code; `core/kit.ERROR_CODES` is the list, tested), `ui/satchel.qss` with `@colour` tokens swapped in by `ui/theme.py` (an unknown token raises; a test forbids hex colours in the QSS), Fusion style as the neutral base, heading fonts loaded from package data. `ui/components.py`: `button(kind)`, `page_title`, `panel_heading`, `muted`, `caption`, `frame(role)`; QSS matches only `[kind=…]`/`[role=…]` (lesson 12). The filled danger button is scoped to `QDialog[role="confirm"]`, not a fifth kind. Focus ring = 2 px red border with padding reduced by 1 px, so focus never shifts layout |
| 2026-10-03 | App entry: `[project.gui-scripts] satchel` (no console window); `uv run python -m satchel` runs with a console for development. Single instance via `QLocalServer` named `satchel-<windows user>`: a second launch asks the first to show itself and exits (checked with a real second process). Found on Windows: the client must wait for the disconnect to finish or its message is lost, and Qt objects must be freed before the QApplication (parented to it) or the process crashes on exit |
