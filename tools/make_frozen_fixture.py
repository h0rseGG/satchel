"""Write tests/fixtures/schema_NNNN.satchel for the current schema version.

Run ONCE per schema version, right after adding a migration, then commit the file and
never regenerate it: it stands in for a real file written by that version, and every
later version must still migrate it (SPEC 3.2, 11).

    uv run python tools/make_frozen_fixture.py
"""

import sys
from pathlib import Path

from satchel.core.model import Entity
from satchel.db.connection import open_db
from satchel.db.entities import add_entity, create_character
from satchel.db.migrate import latest_version
from satchel.db.notes import save_note
from satchel.db.sessions import start_session

T = "2026-10-02T10:00:00.000Z"


def main() -> None:
    version = latest_version()
    out = (
        Path(__file__).resolve().parent.parent
        / "tests"
        / "fixtures"
        / f"schema_{version:04d}.satchel"
    )
    if out.exists():
        sys.exit(f"{out.name} already exists. Frozen fixtures are never regenerated.")
    conn = open_db(out)
    create_character(
        conn, "Frozen Fixture", character_id="fixture-char", pc_entity_id="fixture-pc", now=T
    )
    add_entity(conn, Entity(id="fixture-npc", name="Grimbold Ironhand", created_at=T, updated_at=T))
    sid = start_session(conn, "2026-10-02", T, session_id="fixture-session")
    save_note(
        conn,
        "paid grimbold 5gp #debts, met @Newbie",
        now=T,
        session_id=sid,
        note_id="fixture-note",
        new_candidate_id=lambda name: "fixture-candidate",
    )
    # One self-contained file: leave WAL mode and compact before committing it to git.
    conn.execute("PRAGMA journal_mode = DELETE")
    conn.execute("VACUUM")
    conn.close()
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
