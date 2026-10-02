"""TableView: the Table page wired to a character (SPEC 5.1).

It connects the CaptureBox to the store and refreshes from the store's signals.
Saving never loses a note (G1): if a save fails, the text stays in the box and the
message bar says why.
"""

from collections import Counter

from PySide6.QtCore import Signal

from satchel.core.mentions import build_name_index
from satchel.ui import strings
from satchel.ui.capture import CaptureBox
from satchel.ui.feed import NotesFeed
from satchel.ui.pages import TablePage
from satchel.ui.recall import RecallPanel
from satchel.ui.session_strip import SessionStrip
from satchel.ui.store import CharacterStore


class TableView(TablePage):
    session_ended = Signal()  # the main window may nudge to pack (SPEC 7.3)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.store: CharacterStore | None = None
        self.strip = SessionStrip()
        self.session_slot.addWidget(self.strip)
        self.strip.start_requested.connect(self._start_session)
        self.strip.end_requested.connect(self._end_session)
        self.strip.title_changed.connect(lambda sid, t: self.store.set_session_title(sid, t))
        self.capture = CaptureBox()
        self.capture_slot.addWidget(self.capture)
        self.capture.submitted.connect(self._on_submitted)
        self.capture.edit_cancelled.connect(self.message_bar.clear)
        self.notes = NotesFeed(self.feed)
        self.feed.setWidget(self.notes)
        self.notes.edit_requested.connect(self.begin_edit)

        # Recall: cards follow the names typed; search runs alongside short text.
        self.recall = RecallPanel()
        self.recall_slot.addWidget(self.recall, 1)
        self._recall_ids: list[str] = []
        self.capture.recall_changed.connect(self._on_recall_ids)
        self.capture.textChanged.connect(self._update_recall)
        self.recall.link_requested.connect(self.capture.link_entity)
        self.recall.type_chosen.connect(self._on_type_chosen)
        self.last_save_ms: float | None = None

    def set_store(self, store: CharacterStore | None) -> None:
        """Show a character (or nothing). Called by the main window on open/close."""
        self.store = store
        self.capture.clear_box()
        if store is None:
            self.capture.set_index(build_name_index([], {}), Counter(), [])
            self.notes.set_notes([], {})
            self.recall.show_for([], "", None, self.capture.can_link)
            self.strip.show_session(None)
            return
        store.entities_changed.connect(self._refresh)
        store.notes_changed.connect(self._refresh)
        store.session_changed.connect(self._refresh_session)
        self._refresh()
        self._refresh_session()
        self.capture.setFocus()

    def _refresh(self) -> None:
        s = self.store
        if s is not None:
            self.capture.set_index(s.index, s.tag_counts, [s.pc_entity_id])
            self.notes.set_notes(s.feed_notes(), s.index.by_id)
            self._update_recall()

    def _refresh_session(self) -> None:
        if self.store is not None:
            self.strip.show_session(self.store.current_session())

    def _start_session(self) -> None:
        self.store.start_session()
        self.capture.setFocus()

    def _end_session(self) -> None:
        self.store.end_session()
        self.capture.setFocus()
        self.session_ended.emit()

    def _on_recall_ids(self, ids: list[str]) -> None:
        self._recall_ids = ids
        self._update_recall()

    def _update_recall(self) -> None:
        # The capture box may name entities the store has just replaced; keep known ones.
        known = [i for i in self._recall_ids if self.store and i in self.store.index.by_id]
        self.recall.show_for(known, self.capture.toPlainText(), self.store, self.capture.can_link)

    def _on_type_chosen(self, entity_id: str, type_id: str) -> None:
        self.store.set_entity_type(entity_id, type_id)
        self.capture.setFocus()

    def begin_edit(self, note_id: str) -> None:
        text, picks = self.store.edit_form(note_id)
        self.capture.begin_edit(note_id, text, picks)
        self.message_bar.show_message(strings.EDITING_NOTE, "warn")

    def _on_submitted(self, text: str, picks: list) -> None:
        if self.store is None:
            return
        try:
            if self.capture.editing_note_id:
                self.store.edit_note(self.capture.editing_note_id, text, picks)
            else:
                self.store.save_note(text, picks)
        except Exception as e:  # keep the text; never lose a note (G1)
            self.message_bar.show_message(strings.SAVE_FAILED.format(error=e), "err")
            return
        self.last_save_ms = self.store.last_save_ms
        was_editing = self.capture.editing_note_id is not None
        self.capture.clear_box()
        if was_editing:
            self.message_bar.clear()
