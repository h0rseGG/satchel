"""The database side of kits (SPEC 7): copying a live file, and checking a file that
came out of a kit before anything trusts it.

Checks open the file read-only, so a bad or newer file is never written to. A
`VACUUM INTO` copy is a single file in rollback-journal mode (checked on Windows,
SQLite 3.53.1), so a read-only open leaves no -wal/-shm files behind.
"""

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from satchel.core.kit import KitError
from satchel.db.connection import open_db, transaction
from satchel.db.migrate import latest_version
from satchel.db.sessions import latest_change_at


@dataclass(frozen=True)
class FileIdentity:
    """Who a .satchel file belongs to, read without opening it for writing."""

    path: Path
    schema_version: int
    character_id: str | None
    character_name: str | None


def vacuum_into(conn: sqlite3.Connection, dest: Path) -> None:
    """A consistent copy of the open database, even mid-session (SPEC 7.1).
    VACUUM can't run inside a transaction; our connections are in autocommit."""
    conn.execute("VACUUM INTO ?", (str(dest),))


def _read_only(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def read_identity(path: Path) -> FileIdentity:
    """Schema version and meta of a file. Raises KitError("corrupt") if it isn't a
    readable SQLite database, so callers outside satchel.db never see sqlite3."""
    try:
        return _read_identity(path)
    except sqlite3.DatabaseError as e:
        raise KitError("corrupt", str(e)) from e


def _read_identity(path: Path) -> FileIdentity:
    conn = _read_only(path)
    try:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        has_meta = conn.execute(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'meta'"
        ).fetchone()
        meta = {}
        if has_meta:
            meta = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM meta")}
        return FileIdentity(
            Path(path), version, meta.get("character_id"), meta.get("character_name")
        )
    finally:
        conn.close()


def integrity_ok(path: Path) -> bool:
    """PRAGMA integrity_check returns the single row "ok" for a sound file."""
    try:
        conn = _read_only(path)
    except sqlite3.DatabaseError:
        return False
    try:
        rows = conn.execute("PRAGMA integrity_check").fetchall()
        return [r[0] for r in rows] == ["ok"]
    except sqlite3.DatabaseError:
        return False
    finally:
        conn.close()


def is_newer_than_app(identity: FileIdentity) -> bool:
    return identity.schema_version > latest_version()


def upgrade_file(path: Path) -> None:
    """Bring an older file up to this app's schema (open_db migrates). Not a user
    edit, so nothing is bumped (lesson 5)."""
    open_db(path).close()


def set_character_id(path: Path, character_id: str) -> None:
    """Give a copy its own identity ("Add as new" when the id is already here)."""
    conn = open_db(path)
    try:
        with transaction(conn):
            conn.execute("UPDATE meta SET value = ? WHERE key = 'character_id'", (character_id,))
    finally:
        conn.close()


def changed_since(path: Path, when: str) -> bool:
    """True if the file has a user change later than `when` (an ISO UTC time): the
    "local copy has newer edits" warning before Replace (SPEC 7.2)."""
    conn = _read_only(path)
    try:
        latest = latest_change_at(conn)
    finally:
        conn.close()
    return latest is not None and latest > when
