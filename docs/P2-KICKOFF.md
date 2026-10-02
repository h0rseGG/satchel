# P2 kickoff plan ("Desk")

Written 2026-10-03, at the end of P1, for a **fresh Claude session**. Everything a new session needs is in the repo; this file says what to read, what to decide with Jake, and what to build in what order. SPEC.md stays the source of truth; where this plan and the SPEC differ, the SPEC wins until Jake changes it.

## 0. Before starting

- **G1 must have passed** (SPEC 12: one real session, no lost notes, save < 50 ms). Jake reports the result from `docs/G1-CHECKLIST.md`. Log it in SPEC 15 with the date.
- **Fold in G1 findings first.** Anything Jake hit at the table (bugs, friction, slow saves, the Ctrl+Alt+N focus result) becomes task 0 of P2, ahead of new features. Check `%LOCALAPPDATA%\Satchel\satchel.log` with him for `WARNING` (slow save) and `ERROR` lines.
- Green start: `uv sync && uv run ruff check && uv run pytest` (320 tests at the end of P1).

## 1. Read first (in this order)

1. `CLAUDE.md`: working style, rules, environment, commit gate.
2. `SPEC.md` sections 1, 4.6, 5 (5.1 views, 5.2 interaction rules, 5.3 look), 6, 12, 13 (lessons), then **all of 15** (every P0/P1 decision, including the ones Jake didn't see live while he was asleep: 2026-10-03 entries).
3. This file.
4. Skim the code map below; read a module fully only when a task touches it.

### Code map at the end of P1

| Layer | Modules | Notes |
|---|---|---|
| `core` (pure) | `text tags mentions matcher autocomplete display capture recall search kit when model shortnames` | No Qt, sqlite or file I/O (tested). `resolve_note()` in `matcher.py` is the single "what happens on save" |
| `db` | `connection migrate entities notes sessions recall kit` + `migrations/0001_initial.sql` | Only layer that touches SQLite. Every write in `transaction()` |
| `files` | `kits local_state log` | Zip, local.json, satchel.log. Never imports sqlite3 (tested) |
| `ui` | `app main_window pages table capture suggestions feed note_text recall session_strip autosave message_bar dialogs components store kits_ui quick_capture tray hotkey icon theme palette strings satchel.qss` | `CharacterStore` (`store.py`) owns the connection and emits `notes_changed / entities_changed / session_changed`; views refresh from those |

Files closest to the ~300-line split rule: `ui/capture.py` 294, `core/mentions.py` 279, `db/entities.py` 261, `db/notes.py` 254. P2 adds a lot to entities: **split `db/entities.py` before adding to it** (e.g. `db/types.py`, `db/relationships.py`, `db/files.py`).

### UI system rules to keep (P1 plan, SPEC 15)

One component per job: `button(kind)`, `page_title` / `panel_heading` / `caption` / `muted` / `ElidedLabel`, `frame(role)`, `MessageBar` (fixed height, never hidden), `confirm_destructive` (the only confirm), `choice_dialog`, `NameDialog`, `AutosaveLineEdit` (the only edit-in-place field), `note_text` (the only note renderer), `CaptureBox` (the only note input). QSS matches only `[kind=…]` / `[role=…]`. Colours only from `palette.py`. Numbers never in the serif. All words in `strings.py`. Removed rows are hidden before `deleteLater`. No word-wrapped labels inside scroll areas (they overlap on Windows); elide instead.

## 2. Scope (SPEC 12 + 5.1)

P2 "Desk", gate **G2: reviewing a session takes < 2 minutes**.

1. **Review** (replaces v2's Inbox): per session, unreviewed notes; auto links to confirm or remove; candidates to accept (pick a type), merge into an existing entity (re-point links), or dismiss; mark session reviewed. Also where notes are **deleted** and **moved between sessions** (SPEC 5.2.2, 6).
2. **Entity page**: name, type, aliases, tags, summary, body, fields, thread state, relationships, files, pinned notes, backlinks (newest first). Rename, delete (confirm).
3. **Types, fields, threads**: custom types, fields (text, long_text, number, date, link, url; removing keeps values, re-adding restores), thread open/closed.
4. **Relationships + graph**: inline add form (5.2.3), suggested types (v2), a simple graph view.
5. **Files**: images re-encoded to WebP with Pillow and stored as BLOBs (SPEC 2); text files (the demo has one). Portraits.
6. **Palette** (Ctrl+K): jump to any entity, session or command.
7. **Character view**: profile sections, portrait, D&D Beyond link.
8. **Navigation** between Table, Review, entities, Character (not specified yet: see decision D5).

Out of scope (P3, only if G2 shows a need): Markdown export, phone drop folder, local-LLM recap, single .exe.

## 3. Decisions to take with Jake at kickoff

Ask at most 3 at a time (CLAUDE.md). Recommended answer first. Log each in SPEC 15.

**Batch 1 (needed before the schema and Review):**

- **D1. Sticky dismissals.** Today a Review-dismissed auto link comes back when the note is edited (open since P0). *Recommend:* a `link_dismissals (note_id, entity_id)` table (migration 0002); `resolve_note` skips dismissed pairs on auto-link; a typed `@` mention still links. Alternative: store the dismissal in the note text (no, it breaks "removing markup gives back what was typed").
- **D2. Does reviewing a note confirm its links?** (open since P0). *Recommend:* yes. Marking a note (or the whole session) reviewed sets every remaining `auto` link on it to `confirmed`. It's the only way to hit G2 < 2 min: Jake removes the wrong ones, and the rest are confirmed by moving on.
- **D3. Quick type at the table accepts a candidate** (decided in P1 task 8 while Jake slept; SPEC 4.6.1 put accepting in Review). *Recommend:* keep it; Review shows candidates still untyped.

**Batch 2 (needed before the entity page and navigation):**

- **D4. Renames and search.** Renaming leaves old labels in note search rows until a note is re-saved (open since P0). *Recommend:* on rename, rewrite the FTS rows of that entity's backlinks in the same transaction (a few hundred rows at most; fast).
- **D5. Navigation.** *Recommend:* a thin left rail (Table, Review with an unreviewed count, Character) plus Ctrl+K for everything else; entity pages open in the main area with Back. Alternative: tabs. Rail keeps "one way to do each kind of thing".
- **D6. Note delete and move.** *Recommend:* only from Review and the entity page's backlinks, through `confirm_destructive`; a deleted note is a real delete (SPEC 3: no tombstones). Move = pick a session in Review.

**Batch 3 (needed before relationships and files):**

- **D7. Graph scope.** *Recommend:* a neighbourhood graph on the entity page (the entity, its relationships, one hop) drawn with `QGraphicsView`, no physics, no whole-world graph in P2. [NV] layout quality with ~20 nodes; prototype first.
- **D8. Image limits.** *Recommend:* re-encode to WebP at quality 80, longest side 2048 px, refuse files over 25 MB before decoding. [NV] Pillow's WebP support in the uv-managed Python on Windows: check `PIL.features.check("webp")` before relying on it.
- **D9. Nudge gaps.** The end-of-session nudge can't see meta edits (character name) or deletes (no timestamps). *Recommend:* a `meta_updated_at` meta row bumped by `set_meta`, and a `last_delete_at` meta row bumped by every delete; `latest_change_at` reads both. Same migration as D1.

## 4. Schema: migration 0002

Never edit `0001_initial.sql`; add `0002_*.sql`, then a frozen fixture `tests/fixtures/schema_0002.satchel` via `tools/make_frozen_fixture.py` (it refuses to overwrite), and a test that `schema_0001` migrates through 0002. Likely contents (adjust to D1/D9 answers):

- `link_dismissals (note_id → notes ON DELETE CASCADE, entity_id → entities ON DELETE CASCADE, created_at, PK (note_id, entity_id))` STRICT.
- Indexes needed by Review: notes by `(session_id, reviewed_at)`; candidates by `is_candidate`.
- No change needed for files (the table exists), relationships, type_fields, field_values or profile (all in 0001).

Lesson 5 still holds: migrations don't bump `updated_at`.

## 5. Build order (each task = one gated commit; update SPEC 15 as you go)

| # | Task | Notes and tests |
|---|---|---|
| 0 | G1 fixes | From Jake's report and the log |
| 1 | Split `db/entities.py`; migration 0002 + frozen fixture | Migration tests from 0 and from `schema_0001` |
| 2 | Core rules for Review | Pure: sticky dismissal in `resolve_note` / `auto_link` (Hypothesis: a dismissed pair never re-links on edit; typed still links), confirm-on-review, candidate merge (re-point tokens and links; the `note_links` invariant still holds) |
| 3 | DB for Review | `unreviewed_notes(session)`, `confirm_link`, `dismiss_link`, `mark_session_reviewed`, `accept_candidate(type)`, `merge_candidate(into)`, `delete_note`, `move_note(session)`; each one transaction, each bumps what the nudge needs |
| 4 | Navigation shell | Rail or tabs per D5; Back; the Table stays the default page |
| 5 | Review view | Per session list; per note: links as chips with confirm / remove; candidates with accept / merge (one entity picker, 5.2.4) / dismiss; Mark session reviewed. Empty state "Nothing loose. Every page is filed." **Time it on the demo** (12 unreviewed notes): G2 dry run |
| 6 | Entity picker | The one picker (5.2.4); new names create a candidate. Used by merge, relationships, link fields |
| 7 | Entity page | Fields via `AutosaveLineEdit` (and a multi-line equivalent: one component, 0.7 s autosave); backlinks newest first (reuse `note_text`); pinned notes; rename (D4); delete with confirm (cascade per SPEC 3: notes keep the token, shown as a missing chip) |
| 8 | Types and fields | Custom types, field kinds, remove keeps values (`removed = 1`), thread open/closed |
| 9 | Relationships | One inline form pattern (5.2.3) with suggested types; neighbourhood graph per D7 |
| 10 | Files | Pillow (add to deps, log version); WebP per D8; text files; portraits; "No maps or scraps yet." empty state |
| 11 | Palette | Ctrl+K, fuzzy over entities, sessions, commands; reuse `core.search` rules |
| 12 | Character view | Profile sections with autosave, portrait, D&D Beyond link |
| 13 | G2 prep | Checklist like `docs/G1-CHECKLIST.md`; log review durations (start to "Mark session reviewed") in `satchel.log` so Jake can read G2 off it |

Run the app and screenshot each view on the laptop before committing it (that caught four real bugs in P1). Never use `%LOCALAPPDATA%\Satchel` while testing: point `LOCALAPPDATA` at a temp folder.

## 6. Risks and watch items

- **Save spikes**: one 108 ms UI-path save was seen under full-suite load in P1 (normal 4–15 ms) [NV cause]. Watch G1's log; if real, investigate before P2 adds work to the save path (dismissal lookups, FTS rewrites on rename).
- **Review speed** is the gate. Prototype task 5 against the demo early and time it; don't polish entity pages first.
- **Merge** must keep the `note_links` invariant and stored labels (SPEC 4.6.5/4.6.6). Fuzz it.
- **Qt specifics** found in P1: dark mode leaks unless the palette is set (done in `theme.py`); `deleteLater` needs a `hide()` first; native event filters see every message; word-wrapped labels in scroll areas overlap.
- **Real data**: from G1 on, Jake's `.satchel` is real. Migration 0002 must be tested on a copy of a P1-era file (the frozen fixture) before anything ships.

## 7. Prompt for the new session

Paste this to start:

> Read CLAUDE.md, SPEC.md (sections 1, 4.6, 5, 6, 12, 13 and all of 15) and docs/P2-KICKOFF.md. G1 result: [paste the result and anything from satchel.log]. Run uv sync and uv run pytest to confirm a green start. Then fold my G1 findings into task 0, and ask me the batch 1 decisions (D1–D3) from the kickoff plan before writing any code.
