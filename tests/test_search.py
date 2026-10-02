"""SPEC 4.5 search: typo tolerance, prefixes, all words, mentions by full name.
Cases from v2-final:tests/unit/search.test.js, run against FTS5."""

import statistics
import time

import pytest
from hypothesis import given
from hypothesis import strategies as st

from satchel.core.model import Entity
from satchel.core.search import fold, fuzzy_terms, max_edits, should_search, within_edits
from satchel.db.connection import open_db, transaction
from satchel.db.entities import add_entity, create_character
from satchel.db.notes import save_note, search_entities, search_notes

T = "2026-09-01T00:00:00.000Z"


def test_typo_tolerance_by_length():
    assert [max_edits(w) for w in ["ox", "inn", "mira", "aldric"]] == [0, 0, 1, 2]


def test_short_text_runs_search():
    assert should_search("lord aldric")
    assert not should_search("one two three four five")
    assert not should_search("   ")


def test_within_edits_swap_costs_two():
    assert within_edits("grimbld", "grimbold", 1)
    assert not within_edits("mrai", "mira", 1), "swapped letters cost 2"
    assert within_edits("brimstoen", "brimstone", 2)
    assert not within_edits("abcdef", "uvwxyz", 2)


def test_fuzzy_terms():
    vocab = ["mill", "mira", "grimbold", "lantern"]
    assert fuzzy_terms("lantren", vocab) == ["lantern"]
    assert fuzzy_terms("mxl", vocab) == [], "3 letters: no edits"


@pytest.fixture
def conn(tmp_path):
    c = open_db(tmp_path / "s.satchel")
    create_character(c, "Wren", character_id="c", pc_entity_id="pc", now=T)
    mira = Entity(
        id="mira",
        name="Mira Vane",
        aliases=("The Fox",),
        tags=("fence",),
        summary="Knew mum",
        created_at=T,
        updated_at=T,
    )
    add_entity(c, mira)
    save_note(c, "@mira says Lyra is ALIVE #lyra", now=T, note_id="n1")
    save_note(c, "paid grimbold 20gp #debts", now=T, note_id="n2")
    save_note(c, "the mill smells of brimstone", now=T, note_id="n3")
    yield c
    c.close()


def test_finds_notes_by_text_mention_full_name_and_tags(conn):
    assert search_notes(conn, "vane") == ["n1"], "mention indexed by full name too"
    assert search_notes(conn, "debts") == ["n2"]
    assert search_notes(conn, "brimstone") == ["n3"]


def test_finds_entities_by_name_alias_tag_and_summary(conn):
    for q in ["vane", "fox", "fence", "mum"]:
        assert search_entities(conn, q) == ["mira"], q


def test_prefix_and_typos(conn):
    assert search_notes(conn, "brim") == ["n3"], "prefix"
    assert search_notes(conn, "brimstoen") == ["n3"], "2 edits for a 9-letter word (swap = 2)"
    assert search_notes(conn, "grimbld") == ["n2"], "1 deletion"
    assert search_notes(conn, "mil") == ["n3"], "3 letters: prefix only"
    assert search_notes(conn, "mxl") == [], "3 letters: no edits"


def test_all_words_must_match(conn):
    assert search_notes(conn, "lyra alive") == ["n1"]
    assert search_notes(conn, "lyra brimstone") == []


def test_demo_typos_from_the_profile_tips(demo):
    # The demo profile suggests trying "grimbld" and "lantren".
    assert search_notes(demo, "grimbld")
    assert search_entities(demo, "lantren")


def test_search_under_50_ms_at_5000_notes(conn):
    words = [
        "goblin",
        "mill",
        "river",
        "lord",
        "aldric",
        "grimbold",
        "debt",
        "cargo",
        "hollow",
        "king",
        "sister",
        "caldra",
    ]
    with transaction(conn):
        conn.executemany(
            "INSERT INTO notes_fts (note_id, body) VALUES (?, ?)",
            [
                (
                    f"p{i}",
                    " ".join(words[(i * 7 + j * 3) % len(words)] for j in range(12)) + f" note{i}",
                )
                for i in range(5000)
            ],
        )
    times = []
    for q in ["grim", "hollow king", "caldar", "storm ship", "grimbld lord"]:
        t = time.perf_counter()
        search_notes(conn, q)
        times.append((time.perf_counter() - t) * 1000)
    print(
        f"\nsearch at 5000 notes: median {statistics.median(times):.1f} ms, max {max(times):.1f} ms"
    )
    assert max(times) < 50


def levenshtein(a, b):
    """Reference implementation, no shortcuts."""
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ca != cb))
    return row[-1]


short_words = st.text(alphabet="abcdeløø1", min_size=0, max_size=9)


@given(short_words, short_words, st.integers(0, 3))
def test_within_edits_agrees_with_levenshtein(a, b, limit):
    assert within_edits(a, b, limit) == (levenshtein(a, b) <= limit)


@given(short_words, st.lists(short_words, max_size=30))
def test_fuzzy_filters_never_drop_a_real_match(word, vocab):
    w = fold(word)
    brute = [t for t in vocab if t != w and levenshtein(w, t) <= max_edits(w)]
    assert fuzzy_terms(word, vocab) == (brute if max_edits(w) else [])
