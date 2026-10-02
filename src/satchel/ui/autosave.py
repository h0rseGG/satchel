"""AutosaveLineEdit: the one edit-in-place field (SPEC 5.2.1).

- Saves 0.7 s after typing stops, and when you leave the field (or press Enter).
- Saving the same value is a no-op (it doesn't even call back).
- An outside update never overwrites the field while you're typing in it.
"""

from collections.abc import Callable

from PySide6.QtCore import QTimer
from PySide6.QtWidgets import QLineEdit, QWidget

AUTOSAVE_MS = 700


class AutosaveLineEdit(QLineEdit):
    def __init__(self, on_save: Callable[[str], None], parent: QWidget | None = None):
        super().__init__(parent)
        self.on_save = on_save
        self._saved = ""
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.setInterval(AUTOSAVE_MS)
        self._timer.timeout.connect(self.flush)
        self.textEdited.connect(lambda _: self._timer.start())  # user typing only
        self.editingFinished.connect(self.flush)  # Enter or focus out

    def set_value(self, value: str) -> None:
        """Show a value from the store, unless Jake is typing in the field right now."""
        if self.hasFocus() and self.text() != self._saved:
            return
        self._saved = value
        self.setText(value)

    def flush(self) -> None:
        """Save now if the text differs from what was last saved."""
        self._timer.stop()
        value = self.text().strip()
        if value != self._saved:
            self._saved = value
            self.on_save(value)
