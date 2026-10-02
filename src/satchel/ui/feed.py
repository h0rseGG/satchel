"""The notes feed on the Table page (SPEC 5.1): the session's notes, oldest at the top,
newest at the bottom next to the capture box, a ruled line under each (SPEC 5.3).
Clicking a note opens it for editing in the capture box.

It's rebuilt from the store's rows whenever notes or entities change; a session holds
tens of notes, so rebuilding is simpler than patching and still instant.
"""

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QFrame, QHBoxLayout, QScrollArea, QVBoxLayout, QWidget

from satchel.core.model import Entity, NoteRow
from satchel.core.when import time_label
from satchel.ui import strings
from satchel.ui.components import caption, muted
from satchel.ui.note_text import NoteText, note_document
from satchel.ui.palette import SPACE

TIME_WIDTH = 64


class NoteRowView(QFrame):
    clicked = Signal(str)

    def __init__(self, note: NoteRow, by_id: dict[str, Entity], parent: QWidget | None = None):
        super().__init__(parent)
        self.note = note
        self.setProperty("role", "note-row")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setToolTip(strings.CLICK_TO_EDIT)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, SPACE["s"], 0, SPACE["s"])
        layout.setSpacing(SPACE["m"])
        when = caption(time_label(note.created_at))
        when.setFixedWidth(TIME_WIDTH)
        when.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignTop)
        layout.addWidget(when, 0, Qt.AlignmentFlag.AlignTop)
        self.ensurePolished()  # so font() is the stylesheet's body font
        self.text = NoteText(note_document(note, by_id, self.font()))
        layout.addWidget(self.text, 1)

    def mouseReleaseEvent(self, event) -> None:  # noqa: N802 - Qt's name
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self.note.id)
        super().mouseReleaseEvent(event)


class NotesFeed(QWidget):
    edit_requested = Signal(str)

    def __init__(self, scroll: QScrollArea, parent: QWidget | None = None):
        super().__init__(parent)
        self.scroll = scroll
        self.rows: list[NoteRowView] = []
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(0, 0, SPACE["s"], 0)
        self._layout.setSpacing(0)
        self._layout.addStretch(1)  # pushes notes to the bottom, next to the box
        # With no notes, the hint sits at the bottom too, just above the box.
        self.empty = muted(strings.EMPTY_NOTES)
        self._layout.addWidget(self.empty)
        # Keep the newest note in view when rows are added.
        bar = scroll.verticalScrollBar()
        bar.rangeChanged.connect(lambda _min, maximum: bar.setValue(maximum))

    def set_notes(self, notes: list[NoteRow], by_id: dict[str, Entity]) -> None:
        for row in self.rows:
            self._layout.removeWidget(row)
            # deleteLater waits for the event loop; hide now or the old row is still
            # drawn on top of the new ones until then (seen on the laptop).
            row.hide()
            row.deleteLater()
        self.rows = []
        self.empty.setVisible(not notes)
        # Rows go after the top stretch, before the (hidden) empty hint.
        for i, note in enumerate(notes):
            row = NoteRowView(note, by_id)
            row.clicked.connect(self.edit_requested)
            self._layout.insertWidget(1 + i, row)
            self.rows.append(row)

    def row_texts(self) -> list[str]:
        return [r.text.plain_text() for r in self.rows]
