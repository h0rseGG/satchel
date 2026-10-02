"""Data for recall cards (SPEC 4.5): mentions and relationships of one entity.

The entity itself (name, type, tags, summary) is already in the caller's NameIndex, so
this only loads what the index doesn't hold. A card is shown per keystroke, so each
query here uses an index (note_links_entity, relationships_from/_to).
"""

import sqlite3

from satchel.core.model import RecallFacts, Relation
from satchel.db.notes import notes_by_id


def _mention_ids(conn: sqlite3.Connection, entity_id: str, order: str, limit: int) -> list[str]:
    # `order` is only ever one of the two literals below, never user text.
    rows = conn.execute(
        "SELECT n.id FROM notes n JOIN note_links l ON l.note_id = n.id"
        f" WHERE l.entity_id = ? ORDER BY n.created_at {order}, n.id {order} LIMIT ?",
        (entity_id, limit),
    )
    return [r["id"] for r in rows]


def _relations(conn: sqlite3.Connection, entity_id: str, limit: int) -> list[Relation]:
    rows = conn.execute(
        "SELECT * FROM relationships WHERE from_id = ? OR to_id = ?"
        " ORDER BY updated_at DESC, id LIMIT ?",
        (entity_id, entity_id, limit),
    )
    out = []
    for r in rows:
        outgoing = r["from_id"] == entity_id
        other = r["to_id"] if outgoing else r["from_id"]
        direction = "both" if not r["directed"] else "out" if outgoing else "in"
        out.append(Relation(r["type"], other, direction))
    return out


def recall_facts(conn: sqlite3.Connection, entity_id: str) -> RecallFacts:
    count = conn.execute(
        "SELECT COUNT(*) FROM note_links WHERE entity_id = ?", (entity_id,)
    ).fetchone()[0]
    first = notes_by_id(conn, _mention_ids(conn, entity_id, "ASC", 1))
    return RecallFacts(
        entity_id=entity_id,
        mention_count=count,
        first_mention=first[0] if first else None,
        last_mentions=notes_by_id(conn, _mention_ids(conn, entity_id, "DESC", 3)),
        relations=_relations(conn, entity_id, 3),
    )
