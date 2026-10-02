"""The demo is real-sounding data run through the real save path (SPEC 8, v1 lesson 2).

Ported from v2-final:tests/unit/demo.test.js; v3 adds auto-link and candidates.
"""

import sqlite3

from satchel.core.model import stable_id
from satchel.db.entities import load_index
from satchel.db.notes import backlinks, note_links
from tests.fixtures.demo import build_demo, entity_id


def count(conn, sql, *args):
    return conn.execute(sql, args).fetchone()[0]


def links_of(conn, fragment):
    """{entity name: how} for the note whose text contains `fragment`."""
    note_id = conn.execute("SELECT id FROM notes WHERE text LIKE ?", (f"%{fragment}%",)).fetchone()[
        0
    ]
    names = dict(conn.execute("SELECT id, name FROM entities").fetchall())
    return {names[eid]: how for eid, how in note_links(conn, note_id).items()}


def test_g0_counts(demo):
    assert count(demo, "SELECT COUNT(*) FROM notes") == 47
    assert count(demo, "SELECT COUNT(*) FROM entities") == 23
    assert count(demo, "SELECT COUNT(*) FROM entities WHERE is_candidate = 1") == 4
    assert count(demo, "SELECT COUNT(*) FROM notes WHERE reviewed_at IS NULL") == 12


def test_other_counts(demo):
    assert count(demo, "SELECT COUNT(*) FROM types") == 9
    assert count(demo, "SELECT COUNT(*) FROM relationships") == 9
    assert count(demo, "SELECT COUNT(*) FROM files") == 1
    assert count(demo, "SELECT COUNT(*) FROM sessions") == 4
    assert count(demo, "SELECT COUNT(*) FROM notes WHERE original_text IS NOT NULL") == 1
    assert count(demo, "SELECT COUNT(*) FROM pins") == 1
    assert count(demo, "SELECT COUNT(*) FROM notes WHERE session_id IS NULL") == 5
    assert count(demo, "PRAGMA integrity_check") == "ok"


def test_candidates(demo):
    names = [
        r[0] for r in demo.execute("SELECT name FROM entities WHERE is_candidate ORDER BY name")
    ]
    assert names == ["Grimbol", "Hollow King", "Pip", "Vex"]
    assert (
        count(demo, "SELECT COUNT(*) FROM entities WHERE is_candidate AND type_id IS NOT NULL") == 0
    )


def test_the_resolver_handled_the_messy_notes(demo):
    assert links_of(demo, "lends at 10%") == {"Grimbold Ironhand": "typed"}, "short name"
    assert links_of(demo, "HOW???") == {"Lyra Ashdown": "typed"}, "possessive"
    assert links_of(demo, "street name") == {"Mira Vane": "typed"}, "alias, plus auto 'mira'"
    assert links_of(demo, "is lovely") == {
        "Sister Caldra": "typed",
        "Sister Morwen": "typed",
    }, "lower-case short name; shared title is not one"
    assert links_of(demo, "boat at the jetty") == {
        "The Gull’s Wake": "typed",
        "Captain Rook Harlow": "typed",
    }, "apostrophe inside a name"


def test_names_link_themselves(demo):
    assert links_of(demo, "says the mill") == {"Old Bess": "auto"}
    assert links_of(demo, "says boats come in") == {"Pip": "auto"}, "candidates are matchable"
    assert links_of(demo, "sails in 3 days") == {
        "Lyra Ashdown": "auto",
        "The Gull’s Wake": "auto",
    }, "straight apostrophe matches a curly one"
    assert links_of(demo, "SISTER?!?!") == {"Vex": "auto", "Lord Aldric Thorne": "auto"}


def test_hollow_king_collects_every_mention(demo):
    # Two typed @Hollow_King (the second matched the candidate, no duplicate), two plain
    # "hollow king", and "the King" through the alias added after session 3.
    hk = stable_id("candidate:hollow king")
    assert len(backlinks(demo, hk)) == 5


def test_auto_link_only_knows_entities_that_existed_at_the_time(demo):
    # 6 Sept: "the hollow" was typed a week before anyone said "Hollow King".
    assert links_of(demo, "the hollow") == {"Lyra Ashdown": "auto", "Saltmarsh": "typed"}


def test_player_character_is_never_auto_linked(demo):
    assert count(demo, "SELECT COUNT(*) FROM note_links WHERE entity_id = ?", entity_id("pc")) == 0


def test_short_names_in_the_demo(demo):
    short = load_index(demo).short
    for w in ["grimbold", "aldric", "caldra", "lyra", "mira", "rook", "kael", "oswin"]:
        assert w in short, w
    for w in ["ashdown", "sister", "hollow", "lord", "king", "brother", "captain"]:
        assert w not in short, w


def test_edited_note_keeps_first_version_and_its_entities(demo):
    row = demo.execute("SELECT * FROM notes WHERE original_text IS NOT NULL").fetchone()
    assert row["original_text"].startswith("@[Aldric]")
    assert row["text"].endswith(f"(he knew @[Lyra]({entity_id('lyra')}) by name in the ledger)")
    assert links_of(demo, "he flinched") == {
        "Lord Aldric Thorne": "typed",
        "Lyra Ashdown": "typed",
    }


def test_custom_types_deity_with_domain_ship_with_captain_link(demo):
    ship = demo.execute("SELECT * FROM type_fields WHERE label = 'Captain'").fetchone()
    assert (ship["kind"], ship["link_type"]) == ("link", "type-npc")
    captain = count(demo, "SELECT value FROM field_values WHERE field_id = 'f-captain'")
    assert captain == entity_id("rook")
    assert count(demo, "SELECT value FROM field_values WHERE field_id = 'f-domain'") == "Winter"


def test_note_links_invariant(demo):
    from satchel.core.mentions import mention_ids

    existing = {r[0] for r in demo.execute("SELECT id FROM entities")}
    for note_id, text in demo.execute("SELECT id, text FROM notes"):
        assert set(note_links(demo, note_id)) == {i for i in mention_ids(text) if i in existing}


def test_rebuilding_gives_identical_rows(demo_path, tmp_path):
    """Stable ids and replayed times: a second build matches row for row."""
    again = build_demo(tmp_path / "again.satchel")
    a, b = sqlite3.connect(demo_path), sqlite3.connect(again)
    tables = [
        r[0]
        for r in a.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '%fts%'"
        )
    ]
    for t in tables:
        assert sorted(a.execute(f"SELECT * FROM {t}")) == sorted(b.execute(f"SELECT * FROM {t}")), t


def test_titles_only_link_through_an_alias(demo):
    # "my lord daddy" no longer links Lord Aldric: titles aren't short names (4.6.11).
    assert links_of(demo, "my lord daddy") == {"Kael Brightwater": "auto"}
    assert links_of(demo, "cold moon") == {"Hollow King": "auto"}, "alias King"
