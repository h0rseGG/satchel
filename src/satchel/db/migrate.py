"""Numbered SQL migrations tracked by PRAGMA user_version (SPEC 3.2).

Each file in migrations/ is named NNNN_name.sql. Version N means "files 1..N applied".
Each migration runs in its own transaction together with the user_version bump, so a
failure leaves the database exactly as it was.
"""

import re
import sqlite3
from dataclasses import dataclass
from importlib import resources

_NAME_RE = re.compile(r"^(\d{4})_[a-z0-9_]+\.sql$")


class SchemaTooNewError(Exception):
    """The file was written by a newer Satchel. Never open it read-write."""


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    sql: str


def load_migrations() -> list[Migration]:
    folder = resources.files("satchel.db") / "migrations"
    found = []
    for entry in folder.iterdir():
        m = _NAME_RE.match(entry.name)
        if m:
            found.append(Migration(int(m.group(1)), entry.name, entry.read_text("utf-8")))
    found.sort(key=lambda mig: mig.version)
    # Gaps or duplicates would make user_version meaningless.
    if [mig.version for mig in found] != list(range(1, len(found) + 1)):
        raise RuntimeError(f"Migrations must be numbered 1..N: {[m.name for m in found]}")
    return found


def latest_version() -> int:
    return len(load_migrations())


def user_version(conn: sqlite3.Connection) -> int:
    return conn.execute("PRAGMA user_version").fetchone()[0]


def migrate(conn: sqlite3.Connection) -> int:
    """Apply pending migrations. Returns the new version.

    The connection must be in autocommit mode (see connection.py) so that BEGIN and
    COMMIT here are the only transaction control.
    """
    migrations = load_migrations()
    current = user_version(conn)
    if current > len(migrations):
        raise SchemaTooNewError(
            f"File schema is version {current}; this Satchel knows up to {len(migrations)}"
        )
    for mig in migrations[current:]:
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.executescript(mig.sql)
            # PRAGMA can't take a bound parameter; the version is our own int.
            conn.execute(f"PRAGMA user_version = {mig.version:d}")
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
    return user_version(conn)
