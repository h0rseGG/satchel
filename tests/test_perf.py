"""Matcher speed (SPEC 4.6.8, 10): < 10 ms per keystroke at 5000 notes / 300 entities.

Per keystroke the capture box does: find the active @/# token, suggest entities or
tags for it, and match plain names for the recall cards. The name index and tag counts
are built once per save, not per keystroke, so they're timed separately.
"""

import random
import statistics
import time

from satchel.core.autocomplete import active_token, suggest_entities
from satchel.core.matcher import find_names, named_entities, resolve_note
from satchel.core.mentions import build_name_index
from satchel.core.model import BUILTIN_TYPES, Entity
from satchel.core.tags import suggest_tags, tag_counts
from satchel.db.connection import open_db, transaction
from satchel.db.entities import add_entity, create_character
from satchel.db.notes import save_note

T0 = "2026-09-01T10:00:00.000Z"
TYPES_BY_ID = {t.id: t for t in BUILTIN_TYPES}
SYLLABLES = [
    "al",
    "bar",
    "cor",
    "dun",
    "el",
    "fen",
    "gar",
    "hal",
    "ir",
    "jor",
    "kel",
    "lun",
    "mor",
    "nor",
    "or",
    "pel",
    "quin",
    "ros",
    "sul",
    "tor",
]
TYPES = ["type-npc", "type-npc", "type-npc", "type-location", "type-item", "type-faction"]


def make_world(n_entities=300, n_notes=5000, seed=7):
    rng = random.Random(seed)

    def word():
        return "".join(rng.choice(SYLLABLES) for _ in range(rng.randint(2, 3))).capitalize()

    entities = []
    for i in range(n_entities):
        name = " ".join(word() for _ in range(rng.randint(1, 3)))
        aliases = (f"The {word()}",) if rng.random() < 0.2 else ()
        entities.append(
            Entity(
                id=f"e{i}",
                name=name,
                type_id=rng.choice(TYPES),
                aliases=aliases,
                updated_at=f"2026-09-{rng.randint(1, 28):02d}T00:00:00.000Z",
            )
        )
    filler = [
        "went",
        "to",
        "the",
        "and",
        "then",
        "paid",
        "saw",
        "met",
        "lied",
        "fled",
        "told",
        "us",
        "about",
    ]
    tags = ["debts", "clue", "loot", "lyra", "do not trust", "quest", "rumour"]
    notes = []
    for _ in range(n_notes):
        words = [rng.choice(filler) for _ in range(rng.randint(5, 20))]
        words.insert(rng.randrange(len(words)), rng.choice(entities).name.lower())
        notes.append((" ".join(words), rng.sample(tags, rng.randint(0, 2))))
    return entities, notes


def keystroke(text, index, counts):
    """What the capture box runs after each key press."""
    tok = active_token(text, len(text))
    if tok and tok.kind == "@":
        suggest_entities(tok.query, index)
    elif tok and tok.kind == "#":
        suggest_tags(tok.query, counts)
    named_entities(text, index)


def test_matcher_under_10_ms_per_keystroke():
    entities, notes = make_world()
    t0 = time.perf_counter()
    index = build_name_index(entities, TYPES_BY_ID)
    counts = tag_counts(tags for _, tags in notes)
    build_ms = (time.perf_counter() - t0) * 1000

    names = [e.name.lower() for e in entities[:6]]
    note = (
        f"met {names[0]} at the inn, @{entities[1].name.split()[0]} lied about "
        f"{names[2]} and {names[3]}. paid {names[4]} 20gp #debts then {names[5]} fled #clue"
    )
    times = []
    for i in range(1, len(note) + 1):
        t = time.perf_counter()
        keystroke(note[:i], index, counts)
        times.append((time.perf_counter() - t) * 1000)

    median = statistics.median(times)
    worst = max(times)
    print(
        f"\nindex build {build_ms:.1f} ms; per keystroke median {median:.2f} ms, max {worst:.2f} ms"
    )
    assert median < 10, f"median {median:.2f} ms"
    assert worst < 10, f"worst keystroke {worst:.2f} ms"
    assert len(find_names(note, index)) >= 5  # the test text really does contain names


def test_save_resolution_is_fast():
    """Index build + resolve, not the DB. Save time has no target (SPEC 10); this only
    catches a pathological regression."""
    entities, _ = make_world()
    text = f"@{entities[0].name.replace(' ', '_')} met {entities[1].name.lower()} and @Nobody"
    t = time.perf_counter()
    index = build_name_index(entities, TYPES_BY_ID)
    r = resolve_note(text, index)
    ms = (time.perf_counter() - t) * 1000
    print(f"\nindex build + resolve_note: {ms:.1f} ms")
    assert len(r.candidates) == 1
    assert ms < 500


def test_capture_save_on_disk_is_not_pathological(tmp_path):
    """A real save_note, durable on disk (WAL + synchronous=FULL), into a
    file with 5000 notes and 300 entities. Setup takes shortcuts (sync off, notes
    inserted raw in one transaction) because only the timed saves need to be real."""
    entities, notes = make_world()
    conn = open_db(tmp_path / "big.satchel")
    create_character(conn, "Wren Ashdown", character_id="c", pc_entity_id="pc", now=T0)
    conn.execute("PRAGMA synchronous = OFF")
    for e in entities:
        add_entity(conn, e)
    with transaction(conn):
        for i, (text, tags) in enumerate(notes):
            body = text + "".join(f" #{t.replace(' ', '_')}" for t in tags)
            conn.execute(
                "INSERT INTO notes (id, text, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (f"n{i}", body, T0, T0),
            )
            conn.execute("INSERT INTO notes_fts (note_id, body) VALUES (?, ?)", (f"n{i}", body))
    conn.execute("PRAGMA synchronous = FULL")

    times = []
    for i in range(25):
        text = (
            f"@{entities[i].name.replace(' ', '_')} met {entities[i + 1].name.lower()}"
            f" and @Stranger{i} #clue"
        )
        t = time.perf_counter()
        save_note(conn, text, now=T0)
        times.append((time.perf_counter() - t) * 1000)
    conn.close()

    median = statistics.median(times)
    print(f"\nsave_note on disk: median {median:.1f} ms, max {max(times):.1f} ms")
    # No save-time target (Jake, 2026-10-03): only catch something pathological.
    assert median < 500, f"median {median:.1f} ms"
