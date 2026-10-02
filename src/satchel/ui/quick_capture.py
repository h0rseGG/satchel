"""Quick capture (SPEC 5.1): the global key opens a small always-on-top box. Enter saves
into the current session (or between sessions) and closes it; Esc closes it and keeps
whatever was typed for next time. Same CaptureBox as the Table, so it behaves the same.
"""

import ctypes
from collections import Counter

from PySide6.QtCore import Qt
from PySide6.QtGui import QGuiApplication
from PySide6.QtWidgets import QVBoxLayout, QWidget

from satchel.core.mentions import build_name_index
from satchel.ui import strings
from satchel.ui.capture import CaptureBox
from satchel.ui.components import caption, frame
from satchel.ui.palette import SPACE

WIDTH = 640


class QuickCapture(QWidget):
    def __init__(self, main_window):
        super().__init__(
            None,
            Qt.WindowType.Tool  # no taskbar button
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.FramelessWindowHint,
        )
        self.main = main_window
        self.setWindowTitle(strings.QUICK_CAPTURE)
        self.setFixedWidth(WIDTH)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        page = frame("quick")
        outer.addWidget(page)
        layout = QVBoxLayout(page)
        layout.setContentsMargins(SPACE["l"], SPACE["m"], SPACE["l"], SPACE["m"])
        layout.setSpacing(SPACE["s"])
        self.where = caption("")
        layout.addWidget(self.where)
        self.box = CaptureBox(esc_clears=False)
        layout.addWidget(self.box)
        self.status = caption("")  # save errors; fixed space so nothing moves
        self.status.setFixedHeight(self.status.sizeHint().height())
        layout.addWidget(self.status)
        self.box.submitted.connect(self._save)
        self.box.escaped.connect(self.hide)

    # --- Open / close ------------------------------------------------------------------

    def toggle(self) -> None:
        if self.isVisible():
            self.hide()
        else:
            self.open()

    def open(self) -> None:
        store = self.main.store
        if store is None:
            # Nothing to save into: show the main window instead (Welcome page).
            self.main.bring_to_front()
            return
        self.box.set_index(store.index, store.tag_counts, [store.pc_entity_id])
        session = store.current_session()
        where = (
            f"{store.character_name}  ·  {strings.SESSION_WORD} {session.number}"
            if session
            else f"{store.character_name}  ·  {strings.BETWEEN_SESSIONS}"
        )
        self.where.setText(where)
        self.status.setText("")
        self._place()
        self.show()
        self.raise_()
        self.activateWindow()
        # Windows may refuse focus to a background app; the hotkey press entitles us
        # to take it, so ask directly as well.
        ctypes.windll.user32.SetForegroundWindow(int(self.winId()))
        self.box.setFocus()

    def _place(self) -> None:
        """Centred near the top of the screen the mouse is on."""
        screen = QGuiApplication.screenAt(self.cursor().pos()) or QGuiApplication.primaryScreen()
        area = screen.availableGeometry()
        self.adjustSize()
        self.move(area.x() + (area.width() - WIDTH) // 2, area.y() + area.height() // 5)

    # --- Save --------------------------------------------------------------------------

    def _save(self, text: str, picks: list) -> None:
        store = self.main.store
        if store is None:
            return
        try:
            store.save_note(text, picks)
        except Exception as e:  # keep the text; never lose a note (G1)
            self.status.setText(strings.SAVE_FAILED.format(error=e))
            return
        self.box.clear_box()
        self.hide()

    def detach(self) -> None:
        """The character closed: forget its names."""
        self.box.set_index(build_name_index([], {}), Counter(), [])
        self.hide()
