"""The main window. Task 4 gives it a frame to theme; task 5 fills in the Table view."""

from PySide6.QtWidgets import QMainWindow, QVBoxLayout

from satchel.ui import strings
from satchel.ui.components import frame, muted, page_title
from satchel.ui.palette import SPACE


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(strings.APP_NAME)
        self.resize(1100, 720)
        page = frame("page")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(SPACE["xl"], SPACE["l"], SPACE["xl"], SPACE["l"])
        layout.addWidget(page_title(strings.APP_NAME))
        layout.addWidget(muted(strings.EMPTY_NOTES))
        layout.addStretch()
        self.setCentralWidget(page)

    def bring_to_front(self) -> None:
        """Show, un-minimise and focus (a second launch or the tray asks for this)."""
        self.showNormal()
        self.raise_()
        self.activateWindow()
