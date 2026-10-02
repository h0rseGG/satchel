"""CaptureBox: the one box you type notes into (SPEC 4.2, 5.1). Used by the Table view
and by Quick capture, so both behave the same.

Keys (SPEC 4.2):
- Enter always saves, even with suggestions open. Tab picks the highlighted suggestion.
- Up/Down move the highlight. Esc closes the list; a second Esc clears the box (or
  cancels an edit).

The rules (which token is active, what to suggest, what to colour) are pure functions
in satchel.core; this widget only handles keys, the caret and drawing.
Lesson 9: every caret move happens in the same call as the edit, never on a timer.
"""

from collections import Counter

from PySide6.QtCore import QEvent, QPoint, Qt, Signal
from PySide6.QtGui import (
    QKeyEvent,
    QSyntaxHighlighter,
    QTextCursor,
)
from PySide6.QtWidgets import QListWidget, QListWidgetItem, QPlainTextEdit, QWidget

from satchel.core.autocomplete import (
    ActiveToken,
    active_token,
    apply_entity_pick,
    suggest_entities,
)
from satchel.core.capture import apply_tag_pick, highlight_spans
from satchel.core.capture import recall_ids as core_recall_ids
from satchel.core.mentions import NameIndex, Pick, build_name_index
from satchel.core.tags import suggest_tags
from satchel.ui import strings
from satchel.ui.note_text import char_formats
from satchel.ui.palette import SPACE

MAX_LINES = 4
ENTITY_ROLE = Qt.ItemDataRole.UserRole  # item data: ("entity", id) or ("tag", key)


class CaptureHighlighter(QSyntaxHighlighter):
    """Colours links and tags as you type, with the same look as saved notes."""

    def __init__(self, box: CaptureBox):
        super().__init__(box.document())
        self.box = box
        self.formats = char_formats()

    def highlightBlock(self, text: str) -> None:  # noqa: N802 - Qt's name
        for span in highlight_spans(text, self.box.index, never_auto=self.box.never_auto):
            self.setFormat(span.start, span.end - span.start, self.formats[span.kind])


class SuggestionList(QListWidget):
    """The @/# suggestions. It floats over the window (not in any layout), so showing it
    never moves anything (lesson 6), and it never takes focus from the box."""

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


class CaptureBox(QPlainTextEdit):
    submitted = Signal(str, list)  # typed text, picks
    edit_cancelled = Signal()
    recall_changed = Signal(list)  # entity ids for recall cards

    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setProperty("role", "capture")
        self.setPlaceholderText(strings.CAPTURE_PLACEHOLDER)
        self.setLineWrapMode(QPlainTextEdit.LineWrapMode.WidgetWidth)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.setTabChangesFocus(True)  # Tab only picks when the list is open
        self.index: NameIndex = build_name_index([], {})
        self.tag_counts: Counter[str] = Counter()
        self.never_auto: list[str] = []
        self.picks: list[Pick] = []
        self.editing_note_id: str | None = None
        self.token: ActiveToken | None = None
        self._suggestions: SuggestionList | None = None
        self._last_recall: list[str] = []
        self.highlighter = CaptureHighlighter(self)
        self.textChanged.connect(self._refresh)
        self.cursorPositionChanged.connect(self._refresh_suggestions)
        self.document().documentLayout().documentSizeChanged.connect(self._fit_height)
        self._fit_height()

    # --- Data from the store -----------------------------------------------------------

    def set_index(self, index: NameIndex, tag_counts: Counter[str], never_auto: list[str]) -> None:
        """Called when a character opens and after every save (names may be new)."""
        self.index, self.tag_counts, self.never_auto = index, tag_counts, never_auto
        self.highlighter.rehighlight()
        self._refresh()

    # --- Editing an existing note ------------------------------------------------------

    def begin_edit(self, note_id: str, text: str, picks: list[Pick]) -> None:
        self.editing_note_id = note_id
        self._set_text(text, len(text))
        self.picks = list(picks)
        self.setFocus()

    def clear_box(self) -> None:
        self.editing_note_id = None
        self.picks = []
        self._set_text("", 0)

    # --- Keys --------------------------------------------------------------------------

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 - Qt's name
        key = event.key()
        open_list = self._suggestions is not None and self._suggestions.isVisible()
        if key in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            self._submit()  # Enter always saves (SPEC 4.2)
            return
        if key in (Qt.Key.Key_Up, Qt.Key.Key_Down) and open_list:
            self._suggestions.step(-1 if key == Qt.Key.Key_Up else 1)
            self._emit_recall()
            return
        if key == Qt.Key.Key_Escape:
            if open_list:
                self._hide_suggestions()
            elif self.editing_note_id:
                self.clear_box()
                self.edit_cancelled.emit()
            else:
                self.clear_box()
            return
        super().keyPressEvent(event)

    def event(self, e: QEvent) -> bool:
        # Qt hands Tab to focus handling before keyPressEvent; catch it while picking.
        is_tab = e.type() == QEvent.Type.KeyPress and e.key() == Qt.Key.Key_Tab
        if is_tab and self.suggestions_visible():
            self.pick_current()
            return True
        return super().event(e)

    def insertFromMimeData(self, source) -> None:  # noqa: N802 - Qt's name
        """A note is one line: pasted line breaks become spaces."""
        text = source.text().replace("\r\n", " ").replace("\n", " ").replace("\r", " ")
        self.textCursor().insertText(text)

    def _submit(self) -> None:
        text = self.toPlainText().strip()
        if text:
            self.submitted.emit(text, list(self.picks))

    # --- Picking a suggestion ----------------------------------------------------------

    def pick_current(self) -> None:
        if not self._suggestions or not self.token:
            return
        choice = self._suggestions.choice()
        if not choice:
            return
        kind, value = choice
        text = self.toPlainText()
        if kind == "entity":
            new_text, caret, pick = apply_entity_pick(text, self.token, self.index.by_id[value])
            if pick:
                self.picks.append(pick)
        else:
            new_text, caret = apply_tag_pick(text, self.token, value)
        self._replace_token(text, new_text, caret)
        self._hide_suggestions()

    def _replace_token(self, old: str, new: str, caret: int) -> None:
        """Swap just the token (so Ctrl+Z undoes the pick), then place the caret, in
        one go: nothing is left for later (lesson 9)."""
        token = self.token
        after = len(old) - token.end
        cursor = self.textCursor()
        cursor.beginEditBlock()
        cursor.setPosition(token.start)
        cursor.setPosition(token.end, QTextCursor.MoveMode.KeepAnchor)
        cursor.insertText(new[token.start : len(new) - after])
        cursor.setPosition(caret)
        cursor.endEditBlock()
        self.setTextCursor(cursor)

    def _set_text(self, text: str, caret: int) -> None:
        self.setPlainText(text)
        cursor = self.textCursor()
        cursor.setPosition(caret)
        self.setTextCursor(cursor)

    # --- Suggestions and recall ----------------------------------------------------------

    def _refresh(self) -> None:
        self._refresh_suggestions()
        self._emit_recall()

    def _refresh_suggestions(self) -> None:
        text = self.toPlainText()
        caret = self.textCursor().position()
        self.token = active_token(text, caret)
        if not self.token:
            self._hide_suggestions()
            return
        items: list[tuple[str, tuple[str, str] | None]] = []
        if self.token.kind == "@":
            for e in suggest_entities(self.token.query, self.index):
                items.append((self._entity_label(e), ("entity", e.id)))
            if not items and self.token.query:
                items.append((strings.NEW_CANDIDATE.format(name=self.token.query), None))
        else:
            for tag, n in suggest_tags(self.token.query, self.tag_counts):
                items.append(
                    (f"#{tag.replace(' ', '_')}  ·  {strings.count(n, 'note')}", ("tag", tag))
                )
        if not items:
            self._hide_suggestions()
            return
        self._show_suggestions(items)

    def _entity_label(self, e) -> str:
        if e.is_candidate:
            kind = strings.CANDIDATE
        else:
            t = self.index.types_by_id.get(e.type_id)
            kind = t.label if t else ""
        return f"{e.name}  ·  {kind}" if kind else e.name

    def _show_suggestions(self, items) -> None:
        host = self.window()
        if self._suggestions is None or self._suggestions.parent() is not host:
            self._suggestions = SuggestionList(host)
        lst = self._suggestions
        lst.clear()
        for label, data in items:
            item = QListWidgetItem(label)
            if data:
                item.setData(ENTITY_ROLE, data)
            else:
                item.setFlags(Qt.ItemFlag.NoItemFlags)  # a hint, not a choice
            lst.addItem(item)
        lst.select_first()
        self._place_suggestions()
        lst.show()
        lst.raise_()

    def _place_suggestions(self) -> None:
        """Just above the box, as wide as it; below it if there's no room above."""
        lst = self._suggestions
        host = self.window()
        row_h = lst.sizeHintForRow(0) if lst.count() else 24
        height = row_h * lst.count() + 2 * lst.frameWidth()
        top_left = self.mapTo(host, QPoint(0, 0))
        y = top_left.y() - height - SPACE["xs"]
        if y < 0:
            y = top_left.y() + self.height() + SPACE["xs"]
        lst.setGeometry(top_left.x(), y, self.width(), height)

    def _hide_suggestions(self) -> None:
        if self._suggestions is not None:
            self._suggestions.hide()

    def suggestions_visible(self) -> bool:
        return self._suggestions is not None and self._suggestions.isVisible()

    def suggestion_labels(self) -> list[str]:
        if not self.suggestions_visible():
            return []
        return [self._suggestions.item(i).text() for i in range(self._suggestions.count())]

    def _emit_recall(self) -> None:
        highlighted = None
        if self.suggestions_visible():
            choice = self._suggestions.choice()
            if choice and choice[0] == "entity":
                highlighted = choice[1]
        ids = core_recall_ids(
            self.toPlainText(), self.index, highlighted_id=highlighted, exclude=self.never_auto
        )
        if ids != self._last_recall:
            self._last_recall = ids
            self.recall_changed.emit(ids)

    # --- Size: one line, growing to MAX_LINES as you type ----------------------------------

    def _fit_height(self, *_) -> None:
        # QPlainTextEdit's layout reports the document height in lines.
        lines = max(1, min(MAX_LINES, int(self.document().size().height())))
        margins = self.contentsMargins()
        doc_margin = 2 * self.document().documentMargin()
        height = lines * self.fontMetrics().lineSpacing() + doc_margin
        self.setFixedHeight(int(height + margins.top() + margins.bottom() + 2 * SPACE["xs"]))
