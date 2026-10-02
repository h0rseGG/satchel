"""SPEC 7: Pack kit, Unpack kit (check, Add as new, Replace) and local.json.

Kits are built from the demo; every file lives under tmp_path.
"""

import ast
import json
import sqlite3
import zipfile
from datetime import datetime
from pathlib import Path

import pytest

from satchel.core.kit import (
    KitError,
    Manifest,
    kit_filename,
    manifest_json,
    parse_manifest,
    replaced_filename,
    slugify,
)
from satchel.db.connection import open_db
from satchel.db.kit import changed_since, read_identity
from satchel.db.notes import save_note
from satchel.files.kits import add_as_new, list_characters, open_kit, pack_kit, replace_with_kit
from satchel.files.local_state import (
    DEFAULT_HOTKEY,
    LocalState,
    load_state,
    record_packed,
    save_state,
)

EXPORTED = "2026-10-01T13:30:00.000Z"
LATER = "2026-10-02T09:00:00.000Z"


def manifest(**over) -> Manifest:
    fields = dict(
        format="satchel",
        schema_version=1,
        character_id="char-1",
        character_name="Wren Ashdown",
        exported_at=EXPORTED,
        app_version="3.0.0",
    )
    return Manifest(**{**fields, **over})


# --- Names and manifest (pure) ---------------------------------------------------------


@pytest.mark.parametrize(
    "name, slug",
    [
        ("Wren Ashdown", "wren-ashdown"),
        ("Ælfrēd the Bold!", "aelfred-the-bold"),
        ("Zoë  O'Hara", "zoe-o-hara"),
        ("!!!", "character"),
        ("龍", "character"),
    ],
)
def test_slugify(name, slug):
    assert slugify(name) == slug


def test_kit_filename_matches_spec_example():
    when = datetime(2026, 10, 1, 21, 30)
    assert kit_filename("Wren Ashdown", when) == "wren-ashdown-2026-10-01-2130.kit"
    assert replaced_filename("Wren Ashdown", when) == "wren-ashdown-2026-10-01-213000.satchel"


def test_manifest_json_is_canonical_and_round_trips():
    m = manifest()
    text = manifest_json(m)
    assert text == manifest_json(manifest())
    assert list(json.loads(text)) == sorted(json.loads(text))
    assert text.endswith("\n")
    assert parse_manifest(text) == m


@pytest.mark.parametrize(
    "text, code",
    [
        ("{nope", "bad_manifest"),
        ("[1, 2]", "bad_manifest"),
        (json.dumps({"format": "zip"}), "not_satchel"),
        (json.dumps({"format": "satchel"}), "bad_manifest"),
        (
            manifest_json(manifest()).replace('"schema_version": 1', '"schema_version": true'),
            "bad_manifest",
        ),
        (
            manifest_json(manifest()).replace('"schema_version": 1', '"schema_version": "1"'),
            "bad_manifest",
        ),
        (manifest_json(manifest(character_id="")), "bad_manifest"),
    ],
)
def test_parse_manifest_refuses(text, code):
    with pytest.raises(KitError) as e:
        parse_manifest(text)
    assert e.value.code == code


# --- Pack ---------------------------------------------------------------------------


@pytest.fixture
def kit(demo, tmp_path) -> Path:
    out = tmp_path / "out"
    out.mkdir()
    path = out / "wren-ashdown-2026-10-01-2130.kit"
    pack_kit(demo, path, exported_at=EXPORTED, app_version="3.0.0")
    return path


def test_pack_writes_manifest_and_database_only(kit, demo):
    with zipfile.ZipFile(kit) as zf:
        assert sorted(zf.namelist()) == ["character.satchel", "manifest.json"]
        m = parse_manifest(zf.read("manifest.json").decode())
    assert (
        m.character_id
        == demo.execute("SELECT value FROM meta WHERE key = 'character_id'").fetchone()[0]
    )
    assert (m.character_name, m.exported_at, m.schema_version) == ("Wren Ashdown", EXPORTED, 1)


def test_pack_leaves_no_temporary_files(kit):
    assert [p.name for p in kit.parent.iterdir()] == [kit.name]


def test_pack_then_unpack_gives_the_same_rows(kit, demo, tmp_path):
    unpacked = open_kit(kit, tmp_path / "work")
    copy = open_db(unpacked.db_path)
    for table in ["notes", "entities", "note_links", "sessions", "relationships", "pins"]:
        sql = f"SELECT * FROM {table} ORDER BY 1, 2"
        assert [tuple(r) for r in copy.execute(sql)] == [tuple(r) for r in demo.execute(sql)]
    copy.close()


# --- Unpack: refusals (SPEC 7.2) ---------------------------------------------------------


def make_zip(path: Path, members: dict[str, bytes]) -> Path:
    with zipfile.ZipFile(path, "w") as zf:
        for name, data in members.items():
            zf.writestr(name, data)
    return path


def kit_members(kit: Path) -> dict[str, bytes]:
    with zipfile.ZipFile(kit) as zf:
        return {n: zf.read(n) for n in zf.namelist()}


def refused(path: Path, tmp_path: Path) -> str:
    with pytest.raises(KitError) as e:
        open_kit(path, tmp_path / "work")
    return e.value.code


def test_refuses_a_file_that_is_not_a_zip(tmp_path):
    path = tmp_path / "x.kit"
    path.write_text("hello")
    assert refused(path, tmp_path) == "not_zip"


def test_refuses_missing_or_bad_manifest(kit, tmp_path):
    db = kit_members(kit)["character.satchel"]
    assert refused(make_zip(tmp_path / "a.kit", {"character.satchel": db}), tmp_path) == (
        "no_manifest"
    )
    bad = {"manifest.json": b"{", "character.satchel": db}
    assert refused(make_zip(tmp_path / "b.kit", bad), tmp_path) == "bad_manifest"
    latin = {"manifest.json": b"\xff\xfe", "character.satchel": db}
    assert refused(make_zip(tmp_path / "c.kit", latin), tmp_path) == "bad_manifest"
    other = {"manifest.json": manifest_json(manifest(format="other")).encode()}
    assert refused(make_zip(tmp_path / "d.kit", other), tmp_path) == "not_satchel"


def test_refuses_missing_database(kit, tmp_path):
    only = {"manifest.json": kit_members(kit)["manifest.json"]}
    assert refused(make_zip(tmp_path / "x.kit", only), tmp_path) == "no_database"


def test_refuses_a_database_that_is_not_sqlite(kit, tmp_path):
    members = kit_members(kit) | {"character.satchel": b"not a database at all" * 100}
    assert refused(make_zip(tmp_path / "x.kit", members), tmp_path) == "corrupt"


def test_refuses_a_damaged_database(kit, tmp_path):
    db = bytearray(kit_members(kit)["character.satchel"])
    page = 4096
    db[page * 3 : page * 4] = b"\x00\xff" * (page // 2)  # wreck one page past the header
    members = kit_members(kit) | {"character.satchel": bytes(db)}
    assert refused(make_zip(tmp_path / "x.kit", members), tmp_path) == "corrupt"


def test_refuses_a_newer_schema(kit, tmp_path):
    src = tmp_path / "newer.satchel"
    src.write_bytes(kit_members(kit)["character.satchel"])
    raw = sqlite3.connect(src)
    raw.execute("PRAGMA user_version = 99")
    raw.close()
    members = kit_members(kit) | {"character.satchel": src.read_bytes()}
    assert refused(make_zip(tmp_path / "x.kit", members), tmp_path) == "too_new"


def test_refuses_a_manifest_for_another_character(kit, tmp_path):
    members = kit_members(kit) | {"manifest.json": manifest_json(manifest()).encode()}
    assert refused(make_zip(tmp_path / "x.kit", members), tmp_path) == "mismatch"


def test_checking_writes_only_inside_the_work_folder(kit, tmp_path):
    before = sorted(p.relative_to(tmp_path) for p in tmp_path.rglob("*"))
    open_kit(kit, tmp_path / "work")
    after = sorted(p.relative_to(tmp_path) for p in tmp_path.rglob("*"))
    assert [p for p in after if p not in before and p.parts[0] != "work"] == []


# --- Add as new ---------------------------------------------------------------------------


def test_add_as_new_then_again_gets_a_new_id_and_name(kit, tmp_path):
    live = tmp_path / "Satchel"
    first = add_as_new(open_kit(kit, tmp_path / "w1"), live)
    second = add_as_new(open_kit(kit, tmp_path / "w2"), live, make_id=lambda: "new-id")
    assert (first.name, second.name) == ("wren-ashdown.satchel", "wren-ashdown-2.satchel")
    a, b = read_identity(first), read_identity(second)
    assert a.character_id != b.character_id == "new-id"
    assert {i.path.name for i in list_characters(live)} == {first.name, second.name}


def test_list_characters_skips_unreadable_files(kit, tmp_path):
    live = tmp_path / "Satchel"
    add_as_new(open_kit(kit, tmp_path / "w"), live)
    (live / "junk.satchel").write_text("not sqlite")
    assert [i.character_name for i in list_characters(live)] == ["Wren Ashdown"]


# --- Replace ----------------------------------------------------------------------------


@pytest.fixture
def local_copy(kit, tmp_path) -> Path:
    """A live copy of the character with one edit made after the kit was packed."""
    path = add_as_new(open_kit(kit, tmp_path / "w-local"), tmp_path / "Satchel")
    conn = open_db(path)
    save_note(conn, "a note typed after packing", now=LATER)
    conn.close()
    return path


def test_local_edits_newer_than_the_kit_are_detected(kit, local_copy):
    assert changed_since(local_copy, EXPORTED) is True
    assert changed_since(local_copy, "2026-12-31T00:00:00.000Z") is False


def test_replace_parks_the_old_file_and_swaps_in_the_kit(kit, local_copy, tmp_path):
    folder = local_copy.parent
    parked = replace_with_kit(
        open_kit(kit, tmp_path / "w-new"), local_copy, folder, local_time=datetime(2026, 10, 2, 9)
    )
    assert parked == folder / "replaced" / "wren-ashdown-2026-10-02-090000.satchel"

    def has_late_note(path):
        c = open_db(path)
        n = c.execute("SELECT COUNT(*) FROM notes WHERE created_at = ?", (LATER,)).fetchone()[0]
        c.close()
        return n == 1

    assert has_late_note(parked), "the old file, with its edit, is kept"
    assert not has_late_note(local_copy), "the live file is now the kit"
    leftovers = [p.name for p in folder.iterdir() if p.suffix not in (".satchel", "")]
    assert leftovers == []


def test_replace_refuses_another_character(kit, local_copy, tmp_path):
    other = tmp_path / "other.satchel"
    c = open_db(other)
    c.execute("INSERT INTO meta (key, value) VALUES ('character_id', 'someone-else')")
    c.close()
    with pytest.raises(KitError) as e:
        replace_with_kit(
            open_kit(kit, tmp_path / "w"), other, tmp_path, local_time=datetime(2026, 10, 2)
        )
    assert e.value.code == "not_same_character"
    assert other.exists() and not (tmp_path / "replaced").exists()


# --- local.json --------------------------------------------------------------------------


def test_local_state_defaults_round_trip_and_record_packed(tmp_path):
    assert load_state(tmp_path) == LocalState()
    save_state(tmp_path, LocalState(last_character="wren-ashdown.satchel"))
    record_packed(tmp_path, "char-1", EXPORTED)
    state = load_state(tmp_path)
    assert state.last_character == "wren-ashdown.satchel"
    assert state.last_packed_at == {"char-1": EXPORTED}
    assert state.hotkey == DEFAULT_HOTKEY
    assert sorted(p.name for p in tmp_path.iterdir()) == ["local.json"]


@pytest.mark.parametrize("text", ["{broken", "[]", '{"last_packed_at": {"c": 5}}'])
def test_broken_local_state_is_kept_aside_and_defaults_used(tmp_path, text):
    (tmp_path / "local.json").write_text(text)
    assert load_state(tmp_path) == LocalState()
    assert (tmp_path / "local.json.bad").read_text() == text
    assert not (tmp_path / "local.json").exists()


# --- Layering ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "path",
    sorted((Path(__file__).parent.parent / "src" / "satchel" / "files").glob("*.py")),
    ids=lambda p: p.name,
)
def test_files_package_never_touches_sqlite(path):
    """CLAUDE.md: only satchel.db touches the database."""
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            assert all(a.name.split(".")[0] != "sqlite3" for a in node.names), path.name
        elif isinstance(node, ast.ImportFrom):
            assert (node.module or "").split(".")[0] != "sqlite3", path.name
