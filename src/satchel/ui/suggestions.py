"""SuggestionList: the @/# suggestions under (or over) the capture box (SPEC 4.2).

It floats over the window (not in any layout), so showing it never moves anything
(lesson 6), and it never takes focus from the box.
"""

from PySide6.QtCore import QPoint, Qt
from PySide6.QtWidgets import QListWidget, QListWidgetItem, QWidget

from satchel.ui.palette import SPACE

ENTITY_ROLE = Qt.ItemDataRole.UserRole  # item data: ("entity", id) or ("tag", key)


class SuggestionList(QListWidget):
    def __init__(self, parent: QWidget):
        super().__init__(parent)
        self.setProperty("role", "suggestions")
        self.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.hide()

    def choice(self) -> tuple[str, str] | None:
        item = self.currentItem()
        return item.data(ENTITY_ROLE) if item and item.data(ENTITY_ROLE) else None

    def _selectable(self) -> list[int]:
        return [i for i in range(self.count()) if self.item(i).data(ENTITY_ROLE)]

    def select_first(self) -> None:
        rows = self._selectable()
        self.setCurrentRow(rows[0] if rows else -1)

    def step(self, by: int) -> None:
        """Move the highlight by one (Up/Down), wrapping, skipping hint rows."""
        rows = self._selectable()
        if not rows:
            return
        row = self.currentRow()
        pos = rows.index(row) if row in rows else 0
        self.setCurrentRow(rows[(pos + by) % len(rows)])

    def show_items(self, items: list[tuple[str, tuple[str, str] | None]], box: QWidget) -> None:
        """Fill with (label, data) rows (data None = a hint, not a choice), highlight
        the first choice and show just above `box`, as wide as it; below it if there's
        no room above."""
        self.clear()
        for label, data in items:
            item = QListWidgetItem(label)
            if data:
                item.setData(ENTITY_ROLE, data)
            else:
                item.setFlags(Qt.ItemFlag.NoItemFlags)
            self.addItem(item)
        self.select_first()
        height = self.sizeHintForRow(0) * self.count() + 2 * self.frameWidth()
        top_left = box.mapTo(self.parentWidget(), QPoint(0, 0))
        y = top_left.y() - height - SPACE["xs"]
        if y < 0:
            y = top_left.y() + box.height() + SPACE["xs"]
        self.setGeometry(top_left.x(), y, box.width(), height)
        self.show()
        self.raise_()
