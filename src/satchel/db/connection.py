"""Opening a character file safely.

Python's sqlite3 module has its own implicit-transaction rules, which are easy to get
wrong. We switch them off (autocommit=True: SQLite's native behaviour) and open every
transaction ourselves with `transaction()`, so what you read is what happens.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from satchel.db.migrate import SchemaTooNewError, latest_version, migrate


def file_version(path: Path) -> int:
    """user_version of an existing file, read through a read-only connection."""
    uri = Path(path).resolve().as_uri() + "?mode=ro"
    ro = sqlite3.connect(uri, uri=True)
    try:
        return ro.execute("PRAGMA user_version").fetchone()[0]
    finally:
        ro.close()


def open_db(path: Path | str) -> sqlite3.Connection:
    """Open (or create) a character file and bring its schema up to date.

    A file from a newer Satchel is refused before it's ever opened read-write.
    """
    path = Path(path)
    if path.exists() and file_version(path) > latest_version():
        raise SchemaTooNewError(f"{path.name} was written by a newer version of Satchel")

    conn = sqlite3.connect(path, autocommit=True)
    conn.row_factory = sqlite3.Row
    # Foreign keys are off by default in SQLite, per connection.
    conn.execute("PRAGMA foreign_keys = ON")
    # WAL + synchronous=FULL: every committed save survives a power cut (SPEC 1, 10).
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = FULL")
    conn.execute("PRAGMA busy_timeout = 2000")
    migrate(conn)
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """All-or-nothing block: commits on success, rolls back on any error.

    IMMEDIATE takes the write lock up front, so a save never fails halfway with
    "database is locked".
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
