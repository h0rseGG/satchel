"""SPEC 6 and 7.3, plus the data the Table view reads: sessions, current session, note
rows, tag counts and recall facts. Temporary files and the demo only."""

import pytest

from satchel.core.model import Entity, Relation
from satchel.db.connection import open_db
from satchel.db.entities import add_entity, add_relationship, create_character
from satchel.db.notes import mark_reviewed, note_tag_counts, notes_by_id, save_note
from satchel.db.recall import recall_facts
from satchel.db.sessions import (
    current_session,
    end_session,
    latest_change_at,
    list_sessions,
    session_notes,
    set_session_title,
    start_session,
)
from tests.fixtures.demo import entity_id

T = "2026-09-05T11:40:00.000Z"


def t(minute: int) -> str:
    return f"2026-09-05T12:{minute:02d}:00.000Z"


@pytest.fixture
def conn(tmp_path):
    c = open_db(tmp_path / "wren.satchel")
    create_character(c, "Wren Ashdown", character_id="char-1", pc_entity_id="pc", now=T)
    add_entity(c, Entity(id="grim", name="Grimbold Ironhand", created_at=T, updated_at=T))
    add_entity(c, Entity(id="bess", name="Old Bess", created_at=T, updated_at=T))
    yield c
    c.close()


# --- Current session ---------------------------------------------------------------


def test_start_makes_current_and_end_clears_it(conn):
    assert current_session(conn) is None
    sid = start_session(conn, "2026-09-05", T, title="The mill")
    s = current_session(conn)
    assert (s.id, s.number, s.date, s.title) == (sid, 1, "2026-09-05", "The mill")
    end_session(conn)
    assert current_session(conn) is None
    assert [x.id for x in list_sessions(conn)] == [sid], "ending keeps the record"


def test_starting_another_session_replaces_current(conn):
    start_session(conn, "2026-09-05", T)
    second = start_session(conn, "2026-09-12", T)
    assert current_session(conn).id == second
    assert [s.number for s in list_sessions(conn)] == [2, 1], "newest first"


def test_current_session_survives_reopening_the_file(tmp_path):
    path = tmp_path / "x.satchel"
    c = open_db(path)
    sid = start_session(c, "2026-09-05", T)
    c.close()
    c = open_db(path)
    assert current_session(c).id == sid
    c.close()


def test_ending_does_not_count_as_a_change(conn):
    start_session(conn, "2026-09-05", t(1))
    before = latest_change_at(conn)
    end_session(conn)
    assert latest_change_at(conn) == before


# --- Session title (edit in place, SPEC 5.2.1) ------------------------------------


def test_set_title_bumps_updated_at_only_when_it_changes(conn):
    sid = start_session(conn, "2026-09-05", t(1))
    assert set_session_title(conn, sid, "Into the mill", t(2)) is True
    assert set_session_title(conn, sid, "Into the mill", t(3)) is False
    row = conn.execute("SELECT title, updated_at FROM sessions WHERE id = ?", (sid,)).fetchone()
    assert (row["title"], row["updated_at"]) == ("Into the mill", t(2))


# --- Notes for the feed --------------------------------------------------------------


def test_session_notes_oldest_first_with_link_kinds(conn):
    sid = start_session(conn, "2026-09-05", T)
    a = save_note(conn, "@Grimbold lent 20gp", now=t(2), session_id=sid)
    b = save_note(conn, "bess saw it", now=t(1), session_id=sid)
    save_note(conn, "between sessions", now=t(3))
    rows = session_notes(conn, sid)
    assert [r.id for r in rows] == [b, a]
    assert rows[0].links == {"bess": "auto"}
    assert rows[1].links == {"grim": "typed"}
    assert rows[1].session_id == sid and rows[1].reviewed_at is None


def test_between_sessions_notes_with_since(conn):
    old = save_note(conn, "old", now=t(1))
    new = save_note(conn, "new", now=t(5))
    assert [r.id for r in session_notes(conn, None)] == [old, new]
    assert [r.id for r in session_notes(conn, None, since=t(2))] == [new]


def test_notes_by_id_keeps_order_and_skips_unknown(conn):
    a = save_note(conn, "one", now=t(1))
    b = save_note(conn, "two", now=t(2))
    assert [r.id for r in notes_by_id(conn, [b, "nope", a])] == [b, a]
    assert notes_by_id(conn, []) == []


def test_note_tag_counts_count_notes_not_uses(conn):
    save_note(conn, "#debts #debts #clue", now=t(1))
    save_note(conn, "#Debts again", now=t(2))
    assert note_tag_counts(conn) == {"debts": 2, "clue": 1}


# --- Nudge: latest change (SPEC 7.3) -------------------------------------------------


def test_latest_change_follows_saves_reviews_and_relationships(conn):
    assert latest_change_at(conn) == T
    nid = save_note(conn, "x", now=t(1))
    assert latest_change_at(conn) == t(1)
    mark_reviewed(conn, nid, t(2))
    assert latest_change_at(conn) == t(2), "a review is worth packing"
    add_relationship(conn, "r1", "grim", "bess", "rival", directed=False, now=t(3))
    assert latest_change_at(conn) == t(3)


# --- Recall facts ----------------------------------------------------------------------


def test_recall_facts_counts_first_last_and_relations(conn):
    ids = [save_note(conn, f"grimbold {i}", now=t(i)) for i in range(1, 6)]
    add_relationship(conn, "r1", "grim", "bess", "owes", directed=True, now=t(10))
    add_relationship(conn, "r2", "bess", "grim", "fears", directed=True, now=t(11))
    add_relationship(conn, "r3", "grim", "pc", "friend", directed=False, now=t(12))
    f = recall_facts(conn, "grim")
    assert f.mention_count == 5
    assert f.first_mention.id == ids[0]
    assert [n.id for n in f.last_mentions] == list(reversed(ids))[:3]
    assert f.relations == [
        Relation("friend", "pc", "both"),
        Relation("fears", "bess", "in"),
        Relation("owes", "bess", "out"),
    ]


def test_recall_facts_for_an_unmentioned_entity(conn):
    f = recall_facts(conn, "bess")
    assert (f.mention_count, f.first_mention, f.last_mentions, f.relations) == (0, None, [], [])


def test_recall_facts_on_the_demo(demo):
    f = recall_facts(demo, entity_id("grimbold"))
    assert f.mention_count > 3
    assert len(f.last_mentions) == 3
    times = [n.created_at for n in f.last_mentions]
    assert times == sorted(times, reverse=True)
    assert f.first_mention.created_at <= times[-1]
    assert len(f.relations) == 2  # owed by Wren, rival of Aldric


def test_demo_opens_between_sessions(demo):
    assert current_session(demo) is None
    assert [s.number for s in list_sessions(demo)] == [4, 3, 2, 1]
