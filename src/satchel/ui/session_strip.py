"""The session strip above the feed (SPEC 5.1, 6): which session you're in, its date
and title, and Start session / End session. A session is a record, not a mode."""

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QHBoxLayout, QLabel, QWidget

from satchel.core.model import Session
from satchel.core.when import date_label
from satchel.ui import strings
from satchel.ui.autosave import AutosaveLineEdit
from satchel.ui.components import button, caption, panel_heading
from satchel.ui.palette import SPACE


class SessionStrip(QWidget):
    start_requested = Signal()
    end_requested = Signal()
    title_changed = Signal(str, str)  # session id, title

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.session: Session | None = None
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, SPACE["s"])
        layout.setSpacing(SPACE["m"])

        # "Session" in the heading serif; the number in the body font (SPEC 5.3:
        # numbers are never set in the serif, where "11" reads as "II").
        self.heading = panel_heading(strings.BETWEEN_SESSIONS)
        self.number = QLabel("")
        self.number.setProperty("role", "heading-number")
        self.date = caption("")
        self.title = AutosaveLineEdit(self._save_title)
        self.title.setPlaceholderText(strings.SESSION_TITLE_PLACEHOLDER)
        self.title.setMaximumWidth(360)
        self.start = button(strings.START_SESSION, "primary")
        self.end = button(strings.END_SESSION, "secondary")
        self.start.clicked.connect(self.start_requested)
        self.end.clicked.connect(self.end_requested)

        layout.addWidget(self.heading, 0, Qt.AlignmentFlag.AlignVCenter)
        layout.addWidget(self.number, 0, Qt.AlignmentFlag.AlignVCenter)
        layout.addWidget(self.date, 0, Qt.AlignmentFlag.AlignVCenter)
        layout.addWidget(self.title, 1)
        layout.addStretch()
        layout.addWidget(self.start)
        layout.addWidget(self.end)
        self.show_session(None)

    def show_session(self, session: Session | None) -> None:
        if self.session and (session is None or session.id != self.session.id):
            self.title.flush()  # a title being typed belongs to the old session
        self.session = session
        in_session = session is not None
        self.heading.setText(strings.SESSION_WORD if in_session else strings.BETWEEN_SESSIONS)
        self.number.setText(str(session.number) if in_session else "")
        self.date.setText(date_label(session.date) if in_session else "")
        if in_session:
            self.title.set_value(session.title)
        for w in (self.number, self.date, self.title, self.end):
            w.setVisible(in_session)
        self.start.setVisible(not in_session)

    def _save_title(self, title: str) -> None:
        if self.session:
            self.title_changed.emit(self.session.id, title)
