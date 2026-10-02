"""SPEC 3 and 11: schema, migrations, saving notes, FTS, the note_links invariant.

Every test works on a fresh temporary file (pytest's tmp_path), never real data.
"""

import shutil
import sqlite3
from pathlib import Path

import pytest

from satchel.core.display import segments
from satchel.core.mentions import mention_ids
from satchel.core.model import BUILTIN_TYPES, Entity
from satchel.db import migrate as migrate_mod
from satchel.db.connection import open_db, transaction
from satchel.db.entities import add_entity, create_character, load_index, load_types
from satchel.db.migrate import Migration, SchemaTooNewError, latest_version, load_migrations
from satchel.db.notes import (
    backlinks,
    edit_form,
    edit_note,
    note_links,
    save_note,
    search_notes,
    start_session,
)

FIXTURES = Path(__file__).parent / "fixtures"
T = "2026-09-05T11:40:00.000Z"
T2 = "2026-09-06T09:00:00.000Z"


@pytest.fixture
def conn(tmp_path):
    c = open_db(tmp_path / "wren.satchel")
    create_character(c, "Wren Ashdown", character_id="char-1", pc_entity_id="pc", now=T)
    for eid, name in [("grim", "Grimbold Ironhand"), ("bess", "Old Bess")]:
        add_entity(c, Entity(id=eid, name=name, created_at=T, updated_at=T))
    yield c
    c.close()


def link_invariant_holds(c):
    """note_links ids == token ids whose entity still exists (SPEC 4.6.6)."""
    existing = {r[0] for r in c.execute("SELECT id FROM entities")}
    for note_id, text in c.execute("SELECT id, text FROM notes"):
        want = {i for i in mention_ids(text) if i in existing}
        assert set(note_links(c, note_id)) == want, note_id
    return True


# --- Schema and migrations -------------------------------------------------------


def test_fresh_file_is_at_latest_version_with_builtin_types(tmp_path):
    c = open_db(tmp_path / "new.satchel")
    assert c.execute("PRAGMA user_version").fetchone()[0] == latest_version() == 1
    assert c.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    assert c.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert list(load_types(c).values()) == list(BUILTIN_TYPES)


def test_reopening_is_a_no_op(tmp_path):
    path = tmp_path / "x.satchel"
    open_db(path).close()
    c = open_db(path)
    assert c.execute("PRAGMA user_version").fetchone()[0] == 1


def test_migrations_are_numbered_from_one_without_gaps():
    assert [m.version for m in load_migrations()] == list(range(1, latest_version() + 1))


def test_newer_schema_is_refused_without_touching_the_file(tmp_path):
    path = tmp_path / "future.satchel"
    raw = sqlite3.connect(path)
    raw.execute("PRAGMA user_version = 99")
    raw.close()
    before = path.read_bytes()
    with pytest.raises(SchemaTooNewError):
        open_db(path)
    assert path.read_bytes() == before
    assert not (tmp_path / "future.satchel-wal").exists()


def test_failed_migration_rolls_back_completely(tmp_path, monkeypatch):
    real = load_migrations()
    bad = Migration(2, "0002_bad.sql", "CREATE TABLE half_done (x); SELECT * FROM no_such_table;")
    monkeypatch.setattr(migrate_mod, "load_migrations", lambda: [*real, bad])
    path = tmp_path / "x.satchel"
    with pytest.raises(sqlite3.OperationalError):
        open_db(path)
    raw = sqlite3.connect(path)
    assert raw.execute("PRAGMA user_version").fetchone()[0] == 1
    tables = {r[0] for r in raw.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert "half_done" not in tables


@pytest.mark.parametrize("fixture", sorted(FIXTURES.glob("schema_*.satchel")), ids=lambda p: p.name)
def test_frozen_fixtures_still_migrate(fixture, tmp_path):
    copy = tmp_path / fixture.name
    shutil.copy(fixture, copy)  # never open the committed file itself read-write
    c = open_db(copy)
    assert c.execute("PRAGMA user_version").fetchone()[0] == latest_version()
    assert c.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert c.execute("SELECT text FROM notes WHERE id = 'fixture-note'").fetchone()[0] == (
        "paid @[grimbold](fixture-npc) 5gp #debts, met @[Newbie](fixture-candidate)"
    )
    assert link_invariant_holds(c)


def test_there_is_a_frozen_fixture_for_every_schema_version():
    have = {p.name for p in FIXTURES.glob("schema_*.satchel")}
    assert have == {f"schema_{v:04d}.satchel" for v in range(1, latest_version() + 1)}


# --- Saving notes ------------------------------------------------------------------


def test_save_note_writes_text_links_tags_candidates_and_search(conn):
    sid = start_session(conn, "2026-09-05", T)
    nid = save_note(conn, "@Grimbold lent 20gp, bess saw. met @Pip #debts", now=T, session_id=sid)
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (nid,)).fetchone()
    pip = conn.execute("SELECT * FROM entities WHERE name = 'Pip'").fetchone()
    assert (pip["is_candidate"], pip["type_id"]) == (1, None)
    assert row["text"] == (
        f"@[Grimbold](grim) lent 20gp, @[bess](bess) saw. met @[Pip]({pip['id']}) #debts"
    )
    assert (row["session_id"], row["reviewed_at"], row["original_text"]) == (sid, None, None)
    assert note_links(conn, nid) == {"grim": "typed", "bess": "auto", pip["id"]: "typed"}
    assert [r[0] for r in conn.execute("SELECT tag FROM note_tags")] == ["debts"]
    assert search_notes(conn, "grimb") == [nid]
    assert search_notes(conn, "Bess") == [nid], "search body uses display labels"


def test_player_character_is_never_auto_linked_but_typed_works(conn):
    nid = save_note(conn, "wren ashdown sighed", now=T)
    assert note_links(conn, nid) == {}
    nid = save_note(conn, "@Wren_Ashdown sighed", now=T)
    assert note_links(conn, nid) == {"pc": "typed"}


def test_sessions_number_themselves(conn):
    start_session(conn, "2026-09-05", T)
    start_session(conn, "2026-09-12", T)
    assert [r[0] for r in conn.execute("SELECT number FROM sessions ORDER BY number")] == [1, 2]


def test_failed_save_leaves_nothing_behind(conn):
    with pytest.raises(sqlite3.IntegrityError):
        save_note(conn, "met @Nobody", now=T, session_id="no-such-session")
    assert conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM entities WHERE name = 'Nobody'").fetchone()[0] == 0


def test_transaction_rolls_back_on_error(conn):
    with pytest.raises(RuntimeError), transaction(conn):
        conn.execute("UPDATE meta SET value = 'X' WHERE key = 'character_name'")
        raise RuntimeError
    assert conn.execute("SELECT value FROM meta WHERE key = 'character_name'").fetchone()[0] == (
        "Wren Ashdown"
    )


def test_edit_keeps_first_version_and_links(conn):
    nid = save_note(conn, "@Grimbold paid bess", now=T)
    form, picks = edit_form(conn, nid)
    assert form == "@Grimbold_Ironhand paid bess"
    edit_note(conn, nid, form + " back", now=T2, picks=picks)
    edit_note(conn, nid, edit_form(conn, nid)[0] + " again", now=T2, picks=edit_form(conn, nid)[1])
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (nid,)).fetchone()
    assert row["original_text"] == "@[Grimbold](grim) paid @[bess](bess)", "set once"
    assert row["text"] == "@[Grimbold Ironhand](grim) paid @[bess](bess) back again"
    assert note_links(conn, nid) == {"grim": "typed", "bess": "auto"}
    assert row["updated_at"] == T2


def test_confirmed_links_survive_an_edit(conn):
    nid = save_note(conn, "@Grimbold left", now=T)
    conn.execute("UPDATE note_links SET how = 'confirmed' WHERE note_id = ?", (nid,))
    form, picks = edit_form(conn, nid)
    edit_note(conn, nid, form + " early", now=T2, picks=picks)
    assert note_links(conn, nid) == {"grim": "confirmed"}


def test_deleting_an_entity_keeps_the_token_and_drops_the_link(conn):
    nid = save_note(conn, "@Grimbold left", now=T)
    with transaction(conn):
        conn.execute("DELETE FROM entities WHERE id = 'grim'")
    text = conn.execute("SELECT text FROM notes WHERE id = ?", (nid,)).fetchone()[0]
    assert text == "@[Grimbold](grim) left"
    assert note_links(conn, nid) == {}
    assert segments(text, load_index(conn).by_id)[0].missing
    # Editing it again doesn't recreate anything or fail on the missing entity.
    form, picks = edit_form(conn, nid)
    edit_note(conn, nid, form, now=T2, picks=picks)
    assert note_links(conn, nid) == {}
    assert link_invariant_holds(conn)


def test_backlinks(conn):
    a = save_note(conn, "grimbold", now=T)
    save_note(conn, "nothing here", now=T)
    b = save_note(conn, "@Grimbold again", now=T2)
    assert backlinks(conn, "grim") == [a, b]


def test_search_treats_operators_as_text(conn):
    nid = save_note(conn, 'grimbold said "NEAR" AND - stuff', now=T)
    assert search_notes(conn, "NEAR AND -") == [nid]
    assert search_notes(conn, '"') == []
