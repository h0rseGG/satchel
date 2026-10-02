"""CharacterStore: the UI's only door to a character file (SPEC 15, P1 plan).

Views never hold a connection. They call the store, and the store calls satchel.db
and then says what changed with a signal; every view refreshes from those signals.
That's the one way the UI stays in step with the file.

Times come from `clock` (a function returning an aware datetime) so tests can freeze it.
"""

import logging
import time
from collections import Counter
from collections.abc import Callable, Iterable
from datetime import UTC, datetime
from pathlib import Path

from PySide6.QtCore import QObject, Signal

from satchel import __version__
from satchel.core.kit import slugify
from satchel.core.mentions import NameIndex, Pick
from satchel.core.model import NoteRow, RecallFacts, Session, iso_now, new_id
from satchel.db import entities as db_entities
from satchel.db import notes as db_notes
from satchel.db import recall as db_recall
from satchel.db import sessions as db_sessions
from satchel.db.connection import open_db
from satchel.db.entities import create_character, get_meta, load_index
from satchel.files.kits import free_path

Clock = Callable[[], datetime]
log = logging.getLogger("satchel")
SLOW_SAVE_MS = 50  # G1 target (SPEC 10)


def system_clock() -> datetime:
    return datetime.now(UTC)


class CharacterStore(QObject):
    notes_changed = Signal()
    entities_changed = Signal()
    session_changed = Signal()

    def __init__(self, path: Path, clock: Clock = system_clock, parent: QObject | None = None):
        super().__init__(parent)
        self.path = Path(path)
        self.clock = clock
        self.conn = open_db(self.path)
        self.character_id = get_meta(self.conn, "character_id") or ""
        self.character_name = get_meta(self.conn, "character_name") or self.path.stem
        # Never auto-linked or shown in recall (SPEC 4.5, 4.6.2).
        self.pc_entity_id = get_meta(self.conn, "pc_entity_id") or ""
        self.index: NameIndex = load_index(self.conn)
        self.last_save_ms: float | None = None
        log.info("opened %s", self.path.name)
        self.tag_counts: Counter[str] = db_notes.note_tag_counts(self.conn)

    # --- Time ---------------------------------------------------------------------------

    def now(self) -> str:
        """Now as stored: ISO 8601 UTC."""
        return iso_now(self.clock())

    def local_date(self) -> str:
        """Today's date where Jake is (a session's `date`), YYYY-MM-DD."""
        return self.clock().astimezone().date().isoformat()

    # --- Sessions -----------------------------------------------------------------------

    def current_session(self) -> Session | None:
        return db_sessions.current_session(self.conn)

    def start_session(self) -> Session:
        db_sessions.start_session(self.conn, self.local_date(), self.now())
        self.session_changed.emit()
        self.notes_changed.emit()  # the feed now shows the new (empty) session
        return self.current_session()

    def end_session(self) -> None:
        db_sessions.end_session(self.conn)
        self.session_changed.emit()
        self.notes_changed.emit()

    def set_session_title(self, session_id: str, title: str) -> None:
        if db_sessions.set_session_title(self.conn, session_id, title, self.now()):
            self.session_changed.emit()

    def latest_change_at(self) -> str | None:
        """For the end-of-session nudge (SPEC 7.3)."""
        return db_sessions.latest_change_at(self.conn)

    def feed_notes(self) -> list[NoteRow]:
        """What the Table feed shows: the current session's notes, or between sessions
        the notes typed since the last session started (so the feed isn't years long)."""
        current = self.current_session()
        if current:
            return db_sessions.session_notes(self.conn, current.id)
        sessions = db_sessions.list_sessions(self.conn)
        since = sessions[0].created_at if sessions else None
        return db_sessions.session_notes(self.conn, None, since=since)

    # --- Notes --------------------------------------------------------------------------

    def save_note(self, typed_text: str, picks: Iterable[Pick] = ()) -> str:
        """Capture: durable when this returns (SPEC 1). The time to the durable commit
        is logged for G1 (< 50 ms); a failure is logged and raised, the caller keeps
        the text."""
        started = time.perf_counter()
        try:
            current = self.current_session()
            note_id = db_notes.save_note(
                self.conn,
                typed_text,
                now=self.now(),
                picks=picks,
                session_id=current.id if current else None,
            )
        except Exception:
            log.exception("save failed")
            raise
        self._log_save("save", note_id, started)
        self._after_note_write()
        return note_id

    def edit_form(self, note_id: str) -> tuple[str, list[Pick]]:
        return db_notes.edit_form(self.conn, note_id)

    def edit_note(self, note_id: str, typed_text: str, picks: Iterable[Pick] = ()) -> None:
        started = time.perf_counter()
        try:
            db_notes.edit_note(self.conn, note_id, typed_text, now=self.now(), picks=picks)
        except Exception:
            log.exception("edit failed")
            raise
        self._log_save("edit", note_id, started)
        self._after_note_write()

    def _log_save(self, what: str, note_id: str, started: float) -> None:
        # Ids and times only: note text never goes in the log.
        self.last_save_ms = (time.perf_counter() - started) * 1000
        level = logging.WARNING if self.last_save_ms >= SLOW_SAVE_MS else logging.INFO
        log.log(level, "%s %s: %.1f ms", what, note_id, self.last_save_ms)

    def _after_note_write(self) -> None:
        # A save can create candidates and new tags; refresh what typing reads from.
        before = len(self.index.by_id)
        self.index = load_index(self.conn)
        self.tag_counts = db_notes.note_tag_counts(self.conn)
        self.notes_changed.emit()
        if len(self.index.by_id) != before:
            self.entities_changed.emit()

    # --- Recall and search ----------------------------------------------------------------

    def recall_facts(self, entity_id: str) -> RecallFacts:
        return db_recall.recall_facts(self.conn, entity_id)

    def set_entity_type(self, entity_id: str, type_id: str) -> None:
        """Quick type from a recall card: a person type also gives short names, so the
        index is rebuilt."""
        db_entities.set_entity_type(self.conn, entity_id, type_id, self.now())
        self.index = load_index(self.conn)
        self.entities_changed.emit()

    def search(self, text: str, limit: int = 5) -> tuple[list[str], list[NoteRow]]:
        """Search alongside recall (SPEC 4.5): entity ids and notes, best first."""
        entity_ids = [
            i for i in db_notes.search_entities(self.conn, text, limit) if i in self.index.by_id
        ]
        notes = db_notes.notes_by_id(self.conn, db_notes.search_notes(self.conn, text, limit))
        return entity_ids, notes

    # --- Lifecycle ----------------------------------------------------------------------

    def close(self) -> None:
        self.conn.close()


def create_character_file(folder: Path, name: str, clock: Clock = system_clock) -> Path:
    """A new, empty character: <slug>.satchel (or -2, -3 ...) in `folder`."""
    folder.mkdir(parents=True, exist_ok=True)
    path = free_path(folder, slugify(name))
    conn = open_db(path)
    try:
        create_character(
            conn,
            name,
            character_id=new_id(),
            pc_entity_id=new_id(),
            now=iso_now(clock()),
            app_version=__version__,
        )
    finally:
        conn.close()
    return path
