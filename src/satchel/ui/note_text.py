"""How note text looks, in one place (SPEC 5.3), used by the capture box while typing
and by every saved note on screen:

- typed and confirmed links: a `highlight` chip;
- auto links: no fill, a 1 px `ink-muted` underline;
- a link whose entity is gone: `ink-muted` italic;
- tags: `ink-muted`.

Saved notes are drawn from a QTextDocument rather than an HTML label, because Qt's
HTML subset can't colour an underline separately from the text.
"""

import math

from PySide6.QtCore import QSize, Qt
from PySide6.QtGui import QColor, QPainter, QTextCharFormat, QTextCursor, QTextDocument
from PySide6.QtWidgets import QSizePolicy, QWidget

from satchel.core.capture import AUTO, STORED, TAG, TYPED
from satchel.core.display import segments
from satchel.core.model import HOW_AUTO, Entity, NoteRow
from satchel.ui.palette import COLOURS

MISSING = "missing"


def char_formats() -> dict[str, QTextCharFormat]:
    ink = QColor(COLOURS["ink"])
    muted = QColor(COLOURS["ink-muted"])
    chip = QTextCharFormat()
    chip.setForeground(ink)
    chip.setBackground(QColor(COLOURS["highlight"]))
    auto = QTextCharFormat()
    auto.setForeground(ink)
    auto.setUnderlineStyle(QTextCharFormat.UnderlineStyle.SingleUnderline)
    auto.setUnderlineColor(muted)
    tag = QTextCharFormat()
    tag.setForeground(muted)
    missing = QTextCharFormat()
    missing.setForeground(muted)
    missing.setFontItalic(True)
    plain = QTextCharFormat()
    plain.setForeground(ink)
    return {TYPED: chip, STORED: chip, AUTO: auto, TAG: tag, MISSING: missing, "text": plain}


def note_document(note: NoteRow, by_id: dict[str, Entity], font) -> QTextDocument:
    """A saved note, ready to draw: mentions show their current label (SPEC 4.1)."""
    formats = char_formats()
    doc = QTextDocument()
    doc.setDefaultFont(font)
    doc.setDocumentMargin(0)
    cursor = QTextCursor(doc)
    for seg in segments(note.text, by_id):
        if seg.kind == "mention":
            if seg.missing:
                fmt = formats[MISSING]
            elif note.links.get(seg.id) == HOW_AUTO:
                fmt = formats[AUTO]
            else:
                fmt = formats[TYPED]
        elif seg.kind == "tag":
            fmt = formats[TAG]
        else:
            fmt = formats["text"]
        cursor.insertText(seg.text, fmt)
    return doc


class NoteText(QWidget):
    """Draws one note's document, wrapping to the width it's given."""

    def __init__(self, doc: QTextDocument, parent: QWidget | None = None):
        super().__init__(parent)
        self.doc = doc
        policy = QSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Preferred)
        policy.setHeightForWidth(True)
        self.setSizePolicy(policy)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)  # the row clicks

    def plain_text(self) -> str:
        return self.doc.toPlainText()

    def hasHeightForWidth(self) -> bool:  # noqa: N802 - Qt's name
        return True

    def heightForWidth(self, width: int) -> int:  # noqa: N802 - Qt's name
        self.doc.setTextWidth(width)
        return math.ceil(self.doc.size().height())

    def sizeHint(self) -> QSize:  # noqa: N802 - Qt's name
        width = max(self.width(), 200)
        return QSize(width, self.heightForWidth(width))

    def resizeEvent(self, event) -> None:  # noqa: N802 - Qt's name
        self.doc.setTextWidth(self.width())
        super().resizeEvent(event)

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt's name
        painter = QPainter(self)
        self.doc.drawContents(painter)
