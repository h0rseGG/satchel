"""TableView: the Table page wired to a character (SPEC 5.1).

It connects the CaptureBox to the store and refreshes from the store's signals.
Saving never loses a note (G1): if a save fails, the text stays in the box and the
message bar says why.
"""

import time
from collections import Counter

from satchel.core.mentions import build_name_index
from satchel.ui import strings
from satchel.ui.capture import CaptureBox
from satchel.ui.feed import NotesFeed
from satchel.ui.pages import TablePage
from satchel.ui.store import CharacterStore


class TableView(TablePage):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.store: CharacterStore | None = None
        self.capture = CaptureBox()
        self.capture_slot.addWidget(self.capture)
        self.capture.submitted.connect(self._on_submitted)
        self.capture.edit_cancelled.connect(self.message_bar.clear)
        self.notes = NotesFeed(self.feed)
        self.feed.setWidget(self.notes)
        self.notes.edit_requested.connect(self.begin_edit)
        self.last_save_ms: float | None = None

    def set_store(self, store: CharacterStore | None) -> None:
        """Show a character (or nothing). Called by the main window on open/close."""
        self.store = store
        self.capture.clear_box()
        if store is None:
            self.capture.set_index(build_name_index([], {}), Counter(), [])
            self.notes.set_notes([], {})
            return
        store.entities_changed.connect(self._refresh)
        store.notes_changed.connect(self._refresh)
        self._refresh()
        self.capture.setFocus()

    def _refresh(self) -> None:
        s = self.store
        if s is not None:
            self.capture.set_index(s.index, s.tag_counts, [s.pc_entity_id])
            self.notes.set_notes(s.feed_notes(), s.index.by_id)

    def begin_edit(self, note_id: str) -> None:
        text, picks = self.store.edit_form(note_id)
        self.capture.begin_edit(note_id, text, picks)
        self.message_bar.show_message(strings.EDITING_NOTE, "warn")

    def _on_submitted(self, text: str, picks: list) -> None:
        if self.store is None:
            return
        started = time.perf_counter()
        try:
            if self.capture.editing_note_id:
                self.store.edit_note(self.capture.editing_note_id, text, picks)
            else:
                self.store.save_note(text, picks)
        except Exception as e:  # keep the text; never lose a note (G1)
            self.message_bar.show_message(strings.SAVE_FAILED.format(error=e), "err")
            return
        self.last_save_ms = (time.perf_counter() - started) * 1000
        was_editing = self.capture.editing_note_id is not None
        self.capture.clear_box()
        if was_editing:
            self.message_bar.clear()
