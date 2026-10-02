"""Characters, types, entities and the things hanging off them (SPEC 3.1).

Functions take an open connection. Writes that must happen together are wrapped in
`transaction()` by the caller-facing functions here, so one call = one durable change.
"""

import sqlite3
from collections.abc import Iterable

from satchel.core.mentions import NameIndex, build_name_index
from satchel.core.model import PROFILE_SECTIONS, Entity, EntityType
from satchel.core.text import key
from satchel.db.connection import transaction

# --- Character (meta + player character + profile) ---------------------------


def create_character(
    conn: sqlite3.Connection,
    name: str,
    *,
    character_id: str,
    pc_entity_id: str,
    now: str,
    app_version: str = "",
) -> None:
    """Set up a fresh file: meta rows, the player character entity, empty profile."""
    with transaction(conn):
        pc = Entity(
            id=pc_entity_id, name=name, type_id="type-character", created_at=now, updated_at=now
        )
        _insert_entity(conn, pc)
        meta = {
            "character_id": character_id,
            "character_name": name,
            "pc_entity_id": pc_entity_id,
            "dndbeyond_url": "",
            "app_version_created": app_version,
        }
        conn.executemany("INSERT INTO meta (key, value) VALUES (?, ?)", meta.items())
        conn.executemany(
            "INSERT INTO profile (section, text, updated_at) VALUES (?, '', ?)",
            [(s, now) for s in PROFILE_SECTIONS],
        )


def get_meta(conn: sqlite3.Connection, k: str) -> str | None:
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (k,)).fetchone()
    return row["value"] if row else None


def set_meta(conn: sqlite3.Connection, k: str, value: str) -> None:
    with transaction(conn):
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?, ?) "
            "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            (k, value),
        )


def set_profile(conn: sqlite3.Connection, section: str, text: str, now: str) -> None:
    if section not in PROFILE_SECTIONS:
        raise ValueError(f"Unknown profile section: {section}")
    with transaction(conn):
        conn.execute(
            "UPDATE profile SET text = ?, updated_at = ? WHERE section = ?", (text, now, section)
        )


# --- Types and fields ----------------------------------------------------------


def add_type(conn: sqlite3.Connection, t: EntityType, now: str) -> None:
    with transaction(conn):
        conn.execute(
            "INSERT INTO types (id, label, plural, person, builtin, sort_order, created_at,"
            " updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
            (t.id, t.label, t.plural, int(t.person), t.sort_order, now, now),
        )


def add_field(
    conn: sqlite3.Connection,
    field_id: str,
    type_id: str,
    label: str,
    kind: str,
    *,
    link_type: str | None = None,
    sort_order: int = 0,
) -> None:
    with transaction(conn):
        conn.execute(
            "INSERT INTO type_fields (id, type_id, label, kind, link_type, sort_order)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (field_id, type_id, label, kind, link_type, sort_order),
        )


def set_field_value(conn: sqlite3.Connection, entity_id: str, field_id: str, value: str) -> None:
    with transaction(conn):
        conn.execute(
            "INSERT INTO field_values (entity_id, field_id, value) VALUES (?, ?, ?) "
            "ON CONFLICT (entity_id, field_id) DO UPDATE SET value = excluded.value",
            (entity_id, field_id, value),
        )


def load_types(conn: sqlite3.Connection) -> dict[str, EntityType]:
    rows = conn.execute("SELECT * FROM types ORDER BY sort_order, label").fetchall()
    return {
        r["id"]: EntityType(
            r["id"], r["label"], r["plural"], bool(r["person"]), bool(r["builtin"]), r["sort_order"]
        )
        for r in rows
    }


# --- Entities ------------------------------------------------------------------


def _insert_entity(conn: sqlite3.Connection, e: Entity) -> None:
    """Insert one entity with its aliases, tags and search row. No transaction of its own:
    callers (add_entity, save_note) wrap it with their other writes."""
    conn.execute(
        "INSERT INTO entities (id, type_id, name, summary, body, is_candidate, thread_state,"
        " created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            e.id,
            e.type_id,
            e.name,
            e.summary,
            e.body,
            int(e.is_candidate),
            e.thread_state,
            e.created_at,
            e.updated_at,
        ),
    )
    conn.executemany(
        "INSERT OR IGNORE INTO entity_aliases (entity_id, alias) VALUES (?, ?)",
        [(e.id, a) for a in e.aliases],
    )
    conn.executemany(
        "INSERT OR IGNORE INTO entity_tags (entity_id, tag) VALUES (?, ?)",
        [(e.id, key(t)) for t in e.tags],
    )
    _write_entity_fts(conn, e)


def _write_entity_fts(conn: sqlite3.Connection, e: Entity) -> None:
    conn.execute("DELETE FROM entities_fts WHERE entity_id = ?", (e.id,))
    conn.execute(
        "INSERT INTO entities_fts (entity_id, name, aliases, tags, summary, body)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (e.id, e.name, " ".join(e.aliases), " ".join(e.tags), e.summary, e.body),
    )


def add_entity(conn: sqlite3.Connection, e: Entity) -> None:
    with transaction(conn):
        _insert_entity(conn, e)


def add_alias(conn: sqlite3.Connection, entity_id: str, alias: str, now: str) -> None:
    """Give an entity another name. A user edit, so updated_at moves; search is rewritten."""
    with transaction(conn):
        conn.execute(
            "INSERT OR IGNORE INTO entity_aliases (entity_id, alias) VALUES (?, ?)",
            (entity_id, alias),
        )
        conn.execute("UPDATE entities SET updated_at = ? WHERE id = ?", (now, entity_id))
        entity = next(e for e in load_entities(conn) if e.id == entity_id)
        _write_entity_fts(conn, entity)


def insert_candidates(conn: sqlite3.Connection, candidates: Iterable[Entity]) -> None:
    for c in candidates:
        _insert_entity(conn, c)


def load_entities(conn: sqlite3.Connection) -> list[Entity]:
    aliases: dict[str, list[str]] = {}
    for r in conn.execute("SELECT entity_id, alias FROM entity_aliases ORDER BY alias"):
        aliases.setdefault(r["entity_id"], []).append(r["alias"])
    tags: dict[str, list[str]] = {}
    for r in conn.execute("SELECT entity_id, tag FROM entity_tags ORDER BY tag"):
        tags.setdefault(r["entity_id"], []).append(r["tag"])
    return [
        Entity(
            id=r["id"],
            name=r["name"],
            type_id=r["type_id"],
            aliases=tuple(aliases.get(r["id"], ())),
            is_candidate=bool(r["is_candidate"]),
            updated_at=r["updated_at"],
            created_at=r["created_at"],
            summary=r["summary"],
            body=r["body"],
            tags=tuple(tags.get(r["id"], ())),
            thread_state=r["thread_state"],
        )
        for r in conn.execute("SELECT * FROM entities ORDER BY created_at, id")
    ]


def load_index(conn: sqlite3.Connection) -> NameIndex:
    return build_name_index(load_entities(conn), load_types(conn))


# --- Relationships and files -----------------------------------------------------


def add_relationship(
    conn: sqlite3.Connection,
    rel_id: str,
    from_id: str,
    to_id: str,
    rel_type: str,
    *,
    directed: bool,
    now: str,
    notes: str = "",
) -> None:
    with transaction(conn):
        conn.execute(
            "INSERT INTO relationships (id, from_id, to_id, type, directed, notes, created_at,"
            " updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (rel_id, from_id, to_id, rel_type, int(directed), notes, now, now),
        )


def add_text_file(
    conn: sqlite3.Connection,
    file_id: str,
    name: str,
    data: bytes,
    *,
    mime: str,
    now: str,
    entity_id: str | None = None,
    caption: str = "",
) -> None:
    """Text files only in P0; images (Pillow, WebP) arrive in P2."""
    with transaction(conn):
        conn.execute(
            "INSERT INTO files (id, entity_id, name, kind, mime, size, caption, data, created_at,"
            " updated_at) VALUES (?, ?, ?, 'text', ?, ?, ?, ?, ?, ?)",
            (file_id, entity_id, name, mime, len(data), caption, data, now, now),
        )
