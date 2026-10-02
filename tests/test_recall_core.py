"""core/recall.py and db set_entity_type: what a recall card says, and quick type."""

from datetime import timedelta, timezone

from satchel.core.model import Entity, NoteRow, RecallFacts, Relation
from satchel.core.recall import card_blurb, relation_text
from satchel.core.when import day_label
from satchel.db.connection import open_db
from satchel.db.entities import add_entity, create_character, load_index, set_entity_type

T = "2026-09-05T11:40:00.000Z"
NOTE = NoteRow("n1", "first", None, T, T)


def facts(count: int) -> RecallFacts:
    return RecallFacts("e", count, NOTE if count else None, [], [])


def test_summary_wins():
    assert card_blurb("  Moneylender.  ", facts(9), "first") == ("summary", "Moneylender.")


def test_first_mention_only_past_three_mentions():
    assert card_blurb("", facts(3), "first") is None
    assert card_blurb("", facts(4), "first") == ("first", "first")
    assert card_blurb("", facts(0), "") is None


def test_relation_text_reads_from_this_card():
    assert relation_text(Relation("works for", "hk", "out"), "Lord Aldric", "Hollow King") == (
        "works for Hollow King"
    )
    assert (
        relation_text(Relation("owes", "rook", "in"), "Mira Vane", "Rook") == "Rook owes Mira Vane"
    )
    assert relation_text(Relation("rival", "a", "both"), "Grimbold", "Lord Aldric") == (
        "rival: Lord Aldric"
    )


def test_day_label_is_local():
    assert day_label("2026-09-05T17:00:00.000Z", timezone(timedelta(hours=8))) == "6 Sept"


def test_quick_type_accepts_a_candidate_and_gives_short_names(tmp_path):
    conn = open_db(tmp_path / "x.satchel")
    create_character(conn, "Wren", character_id="c", pc_entity_id="pc", now=T)
    add_entity(
        conn,
        Entity(
            id="v", name="Vex Morrow", type_id=None, is_candidate=True, created_at=T, updated_at=T
        ),
    )
    set_entity_type(conn, "v", "type-npc", "2026-09-06T00:00:00.000Z")
    row = conn.execute("SELECT type_id, is_candidate, updated_at FROM entities WHERE id = 'v'")
    assert tuple(row.fetchone()) == ("type-npc", 0, "2026-09-06T00:00:00.000Z")
    assert load_index(conn).short["morrow"].id == "v", "an NPC is a person: short names"
    conn.close()
