"""The two pages the main window switches between: Welcome (no character open) and
Table (SPEC 5.1). Table is a skeleton of named slots; tasks 6–9 fill them:

    ┃ [session strip]                                 │ RECALL
    ┃ [notes feed, newest at the bottom]              │ [cards]
    ┃ [message bar: fixed height]                     │
    ┃ [capture box]                                   │
"""

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QHBoxLayout, QScrollArea, QVBoxLayout, QWidget

from satchel.ui import strings
from satchel.ui.components import button, frame, muted, page_title, panel_heading
from satchel.ui.message_bar import MessageBar
from satchel.ui.palette import SPACE

RECALL_WIDTH = 340


class WelcomePage(QWidget):
    """First run, or nothing open: New character or Unpack kit."""

    new_character = Signal()
    unpack = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        page = frame("page")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(SPACE["xl"], SPACE["xl"], SPACE["xl"], SPACE["xl"])
        layout.setSpacing(SPACE["l"])
        layout.addWidget(page_title(strings.APP_NAME))
        intro = muted(strings.WELCOME)
        intro.setWordWrap(True)
        layout.addWidget(intro)
        row = QHBoxLayout()
        self.new_button = button(strings.NEW_CHARACTER, "primary")
        self.new_button.clicked.connect(self.new_character)
        row.addWidget(self.new_button)
        self.unpack_button = button(strings.UNPACK_KIT, "secondary")
        self.unpack_button.clicked.connect(self.unpack)
        row.addWidget(self.unpack_button)
        row.addStretch()
        layout.addLayout(row)
        self.message_bar = MessageBar()  # e.g. why the last character didn't open
        layout.addWidget(self.message_bar)
        layout.addStretch()
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(page)


class TablePage(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        outer = QHBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        # Left: the page with the red margin.
        page = frame("page")
        left = QVBoxLayout(page)
        left.setContentsMargins(SPACE["xl"], SPACE["l"], SPACE["l"], SPACE["l"])
        left.setSpacing(SPACE["s"])

        self.session_slot = QVBoxLayout()
        left.addLayout(self.session_slot)

        self.feed = QScrollArea()
        self.feed.setWidgetResizable(True)
        self.feed.setFrameShape(QScrollArea.Shape.NoFrame)
        self.feed.setProperty("role", "feed")
        left.addWidget(self.feed, 1)

        self.message_bar = MessageBar()
        left.addWidget(self.message_bar)

        self.capture_slot = QVBoxLayout()
        left.addLayout(self.capture_slot)
        outer.addWidget(page, 1)

        # Right: the recall panel.
        self.recall_panel = frame("panel")
        self.recall_panel.setFixedWidth(RECALL_WIDTH)
        recall = QVBoxLayout(self.recall_panel)
        recall.setContentsMargins(SPACE["l"], SPACE["l"], SPACE["l"], SPACE["l"])
        recall.addWidget(panel_heading(strings.RECALL_HEADING))
        self.recall_slot = QVBoxLayout()
        recall.addLayout(self.recall_slot, 1)
        outer.addWidget(self.recall_panel)
