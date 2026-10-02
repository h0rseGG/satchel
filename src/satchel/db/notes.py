"""Notes, links, tags, pins and note search (SPEC 3.1, 4.6). Sessions are in sessions.py.

The rules live in satchel.core (resolve_note); this module loads what they need, calls
them, and writes the result in one transaction.
"""

import json
import re
import sqlite3
from collections import Counter
from collections.abc import Iterable

from satchel.core.display import search_text
from satchel.core.matcher import ResolvedNote, resolve_note
from satchel.core.mentions import NameIndex, Pick, to_typed_form
from satchel.core.model import NoteRow, new_id
from satchel.core.search import fuzzy_terms
from satchel.db.connection import transaction
from satchel.db.entities import get_meta, insert_candidates, load_index

# --- Notes -----------------------------------------------------------------------


def _write_derived(
    conn: sqlite3.Connection, note_id: str, resolved: ResolvedNote, index: NameIndex
) -> None:
    """Rewrite a note's links, tags and search row from its resolved text."""
    conn.execute("DELETE FROM note_links WHERE note_id = ?", (note_id,))
    # A token whose entity was deleted stays in the text (shown as a missing chip) but
    # has no link row: the foreign key needs a real entity.
    conn.executemany(
        "INSERT INTO note_links (note_id, entity_id, how) VALUES (?, ?, ?)",
        [(note_id, eid, how) for eid, how in resolved.links.items() if eid in index.by_id],
    )
    conn.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
    conn.executemany(
        "INSERT INTO note_tags (note_id, tag) VALUES (?, ?)",
        [(note_id, t) for t in resolved.tags],
    )
    conn.execute("DELETE FROM notes_fts WHERE note_id = ?", (note_id,))
    conn.execute(
        "INSERT INTO notes_fts (note_id, body) VALUES (?, ?)",
        (note_id, search_text(resolved.text, index.by_id)),
    )


def _resolve(
    conn: sqlite3.Connection,
    typed_text: str,
    *,
    picks: Iterable[Pick],
    prior_how: dict[str, str] | None,
    now: str,
    new_candidate_id,
) -> tuple[ResolvedNote, NameIndex]:
    index = load_index(conn)
    pc_id = get_meta(conn, "pc_entity_id")
    resolved = resolve_note(
        typed_text,
        index,
        picks=picks,
        prior_how=prior_how,
        never_auto=[pc_id] if pc_id else [],
        now=now,
        new_candidate_id=new_candidate_id,
    )
    insert_candidates(conn, resolved.candidates)
    if resolved.candidates:
        index = index.with_entities(resolved.candidates)
    return resolved, index


def save_note(
    conn: sqlite3.Connection,
    typed_text: str,
    *,
    now: str,
    picks: Iterable[Pick] = (),
    session_id: str | None = None,
    note_id: str = "",
    new_candidate_id=None,
) -> str:
    """Capture: resolve the typed text and store the note durably. Returns its id."""
    note_id = note_id or new_id()
    with transaction(conn):
        resolved, index = _resolve(
            conn,
            typed_text,
            picks=picks,
            prior_how=None,
            now=now,
            new_candidate_id=new_candidate_id,
        )
        conn.execute(
            "INSERT INTO notes (id, text, session_id, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (note_id, resolved.text, session_id, now, now),
        )
        _write_derived(conn, note_id, resolved, index)
    return note_id


def note_links(conn: sqlite3.Connection, note_id: str) -> dict[str, str]:
    rows = conn.execute("SELECT entity_id, how FROM note_links WHERE note_id = ?", (note_id,))
    return {r["entity_id"]: r["how"] for r in rows}


def edit_form(conn: sqlite3.Connection, note_id: str) -> tuple[str, list[Pick]]:
    """What the edit box shows for a note, plus the picks that pin its typed links."""
    text = conn.execute("SELECT text FROM notes WHERE id = ?", (note_id,)).fetchone()["text"]
    return to_typed_form(text, load_index(conn), note_links(conn, note_id))


def edit_note(
    conn: sqlite3.Connection,
    note_id: str,
    typed_text: str,
    *,
    now: str,
    picks: Iterable[Pick] = (),
    new_candidate_id=None,
) -> None:
    """Save an edit. The first version is kept in original_text (set once)."""
    with transaction(conn):
        prior = note_links(conn, note_id)
        resolved, index = _resolve(
            conn,
            typed_text,
            picks=picks,
            prior_how=prior,
            now=now,
            new_candidate_id=new_candidate_id,
        )
        conn.execute(
            "UPDATE notes SET original_text = COALESCE(original_text, text), text = ?,"
            " updated_at = ? WHERE id = ?",
            (resolved.text, now, note_id),
        )
        _write_derived(conn, note_id, resolved, index)


def mark_reviewed(conn: sqlite3.Connection, note_id: str, now: str) -> None:
    """Review (P2) sets this; links are confirmed separately. Not a user edit of the
    note's text, so updated_at is left alone."""
    with transaction(conn):
        conn.execute("UPDATE notes SET reviewed_at = ? WHERE id = ?", (now, note_id))


def pin_note(conn: sqlite3.Connection, entity_id: str, note_id: str, now: str) -> None:
    with transaction(conn):
        conn.execute(
            "INSERT OR IGNORE INTO pins (entity_id, note_id, created_at) VALUES (?, ?, ?)",
            (entity_id, note_id, now),
        )


def notes_by_id(conn: sqlite3.Connection, ids: Iterable[str]) -> list[NoteRow]:
    """Load notes for display, in the order given (so search ranking or a feed's order
    survives). Unknown ids are skipped. The ids go in as one JSON array, which avoids
    SQLite's limit on the number of `?` placeholders."""
    ids = list(ids)
    if not ids:
        return []
    id_list = json.dumps(ids)
    links: dict[str, dict[str, str]] = {}
    for r in conn.execute(
        "SELECT note_id, entity_id, how FROM note_links"
        " WHERE note_id IN (SELECT value FROM json_each(?))",
        (id_list,),
    ):
        links.setdefault(r["note_id"], {})[r["entity_id"]] = r["how"]
    rows = {
        r["id"]: NoteRow(
            id=r["id"],
            text=r["text"],
            session_id=r["session_id"],
            created_at=r["created_at"],
            updated_at=r["updated_at"],
            reviewed_at=r["reviewed_at"],
            links=links.get(r["id"], {}),
        )
        for r in conn.execute(
            "SELECT * FROM notes WHERE id IN (SELECT value FROM json_each(?))", (id_list,)
        )
    }
    return [rows[i] for i in ids if i in rows]


def note_tag_counts(conn: sqlite3.Connection) -> Counter[str]:
    """How many notes use each tag key: what core.tags.suggest_tags ranks by."""
    rows = conn.execute("SELECT tag, COUNT(*) AS n FROM note_tags GROUP BY tag")
    return Counter({r["tag"]: r["n"] for r in rows})


def backlinks(conn: sqlite3.Connection, entity_id: str) -> list[str]:
    """Ids of notes that mention an entity, oldest first (entity pages, P2)."""
    rows = conn.execute(
        "SELECT n.id FROM notes n JOIN note_links l ON l.note_id = n.id"
        " WHERE l.entity_id = ? ORDER BY n.created_at, n.id",
        (entity_id,),
    )
    return [r["id"] for r in rows]


# --- Search ------------------------------------------------------------------------

_WORD = re.compile(r"\w+")


def _vocabulary(conn: sqlite3.Connection, fts_table: str) -> list[str]:
    """Every distinct word in an FTS table, via a per-connection temp fts5vocab table."""
    vocab = f"{fts_table}_vocab"
    conn.execute(
        f"CREATE VIRTUAL TABLE IF NOT EXISTS temp.{vocab} USING fts5vocab(main, {fts_table}, row)"
    )
    return [r[0] for r in conn.execute(f"SELECT term FROM temp.{vocab}")]


def fts_query(conn: sqlite3.Connection, fts_table: str, query: str) -> str | None:
    """Build an FTS5 MATCH string: every word must match, as a prefix or within the typo
    limit (SPEC 4.5). Words are quoted, so FTS5 operators typed by the user are text."""
    words = _WORD.findall(query)
    if not words:
        return None
    vocabulary = _vocabulary(conn, fts_table)
    groups = []
    for w in words:
        options = [f'"{w}"*', *(f'"{t}"' for t in fuzzy_terms(w, vocabulary))]
        groups.append("(" + " OR ".join(options) + ")")
    return " AND ".join(groups)


def search_notes(conn: sqlite3.Connection, query: str, limit: int = 50) -> list[str]:
    """Note ids matching the query, best match first."""
    match = fts_query(conn, "notes_fts", query)
    if match is None:
        return []
    rows = conn.execute(
        "SELECT note_id FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank LIMIT ?",
        (match, limit),
    )
    return [r["note_id"] for r in rows]


def search_entities(conn: sqlite3.Connection, query: str, limit: int = 50) -> list[str]:
    """Entity ids matching the query (name, aliases, tags, summary, body), best first."""
    match = fts_query(conn, "entities_fts", query)
    if match is None:
        return []
    rows = conn.execute(
        "SELECT entity_id FROM entities_fts WHERE entities_fts MATCH ? ORDER BY rank LIMIT ?",
        (match, limit),
    )
    return [r["entity_id"] for r in rows]
