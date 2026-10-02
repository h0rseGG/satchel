"""MessageBar: the one place status, warnings and the end-of-session nudge appear.

Lesson 6 / SPEC 5.2.7: messages never shift the layout. The bar is always in the
layout at a fixed height; with no message it's just blank paper. It's never hidden,
because hiding would collapse its space and move everything under it.
"""

from collections.abc import Callable

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QPushButton

from satchel.ui.components import button
from satchel.ui.palette import SPACE

HEIGHT = 40
TONES = ("none", "ok", "warn", "err")


class MessageBar(QFrame):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setProperty("role", "message")
        self.setProperty("tone", "none")
        self.setFixedHeight(HEIGHT)
        self._layout = QHBoxLayout(self)
        self._layout.setContentsMargins(SPACE["m"], 0, SPACE["s"], 0)
        self._layout.setSpacing(SPACE["s"])
        self.text = QLabel("")
        self.text.setTextInteractionFlags(Qt.TextInteractionFlag.NoTextInteraction)
        self._layout.addWidget(self.text, 1)
        self._buttons: list[QPushButton] = []

    @property
    def tone(self) -> str:
        return self.property("tone")

    def show_message(
        self,
        text: str,
        tone: str = "ok",
        actions: list[tuple[str, str, Callable[[], None]]] = (),
    ) -> None:
        """Show `text` on a wash. `actions` are (label, button kind, callback); any
        action also clears the bar, so a nudge goes away once answered."""
        if tone not in TONES:
            raise ValueError(f"unknown tone: {tone}")
        self.clear()
        self.text.setText(text)
        self._set_tone(tone)
        for label, kind, callback in actions:
            b = button(label, kind, self)
            b.clicked.connect(lambda _=False, cb=callback: (self.clear(), cb()))
            self._layout.addWidget(b)
            self._buttons.append(b)

    def clear(self) -> None:
        self.text.setText("")
        self._set_tone("none")
        for b in self._buttons:
            self._layout.removeWidget(b)
            b.deleteLater()
        self._buttons = []

    def _set_tone(self, tone: str) -> None:
        # Qt only re-reads the stylesheet for a changed property after a re-polish.
        self.setProperty("tone", tone)
        self.style().unpolish(self)
        self.style().polish(self)
