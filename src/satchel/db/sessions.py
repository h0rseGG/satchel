"""Sessions and "what changed when" (SPEC 6, 7.3).

A session is a record, not a mode. The *current* session is one meta row
(`current_session_id`): it lives in the character file, so it survives a crash or a
restart mid-session, and Start/End are a single durable write each.
"""

import sqlite3

from satchel.core.model import NoteRow, Session, new_id
from satchel.db.connection import transaction
from satchel.db.notes import notes_by_id

CURRENT_KEY = "current_session_id"


def _session(row: sqlite3.Row) -> Session:
    return Session(row["id"], row["number"], row["date"], row["title"], row["recap"])


def start_session(
    conn: sqlite3.Connection, date: str, now: str, *, title: str = "", session_id: str = ""
) -> str:
    """Create the next numbered session and make it current. Returns its id."""
    session_id = session_id or new_id()
    with transaction(conn):
        number = conn.execute("SELECT COALESCE(MAX(number), 0) + 1 FROM sessions").fetchone()[0]
        conn.execute(
            "INSERT INTO sessions (id, number, date, title, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, number, date, title, now, now),
        )
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?, ?) "
            "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            (CURRENT_KEY, session_id),
        )
    return session_id


def end_session(conn: sqlite3.Connection) -> None:
    """Clear "current". The session record itself doesn't change, so nothing is
    bumped (ending isn't an edit worth packing on its own)."""
    with transaction(conn):
        conn.execute("DELETE FROM meta WHERE key = ?", (CURRENT_KEY,))


def current_session(conn: sqlite3.Connection) -> Session | None:
    row = conn.execute(
        "SELECT s.* FROM sessions s JOIN meta m ON m.value = s.id WHERE m.key = ?",
        (CURRENT_KEY,),
    ).fetchone()
    return _session(row) if row else None


def list_sessions(conn: sqlite3.Connection) -> list[Session]:
    """Every session, newest (highest number) first."""
    return [_session(r) for r in conn.execute("SELECT * FROM sessions ORDER BY number DESC")]


def set_session_title(conn: sqlite3.Connection, session_id: str, title: str, now: str) -> bool:
    """Rename a session. Saving the same title is a no-op (SPEC 5.2.1), so autosave
    can call this freely without bumping updated_at. Returns True if it changed."""
    with transaction(conn):
        cur = conn.execute(
            "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ? AND title IS NOT ?",
            (title, now, session_id, title),
        )
    return cur.rowcount > 0


def session_notes(
    conn: sqlite3.Connection, session_id: str | None, *, since: str | None = None
) -> list[NoteRow]:
    """A session's notes, oldest first (the feed shows the newest at the bottom).
    session_id None means "between sessions"; `since` (an ISO time) limits those, as
    there can be years of them."""
    # `IS` (not `=`) so that None matches NULL.
    rows = conn.execute(
        "SELECT id FROM notes WHERE session_id IS ? AND created_at >= ? ORDER BY created_at, id",
        (session_id, since or ""),
    )
    return notes_by_id(conn, [r["id"] for r in rows])


def latest_change_at(conn: sqlite3.Connection) -> str | None:
    """The newest user change in the file, for the end-of-session nudge (SPEC 7.3).

    ISO 8601 UTC strings sort as times, so MAX works on them. Covers every timestamped
    table plus reviews and pins. Not covered (no timestamps in the schema): meta edits
    such as the character name, and deletes. P1 has neither; revisit in P2.
    """
    row = conn.execute(
        "SELECT MAX(t) FROM ("
        " SELECT MAX(updated_at) AS t FROM notes"
        " UNION ALL SELECT MAX(reviewed_at) FROM notes"
        " UNION ALL SELECT MAX(updated_at) FROM entities"
        " UNION ALL SELECT MAX(updated_at) FROM sessions"
        " UNION ALL SELECT MAX(updated_at) FROM relationships"
        " UNION ALL SELECT MAX(updated_at) FROM files"
        " UNION ALL SELECT MAX(updated_at) FROM types"
        " UNION ALL SELECT MAX(updated_at) FROM profile"
        " UNION ALL SELECT MAX(created_at) FROM pins)"
    ).fetchone()
    return row[0]
