"""Small building blocks, one per job (SPEC 5.2, lesson 1). Views build their buttons
and headings here rather than styling widgets themselves, so the look stays one system.

Styling hangs off two widget properties the stylesheet matches on: `kind` for buttons
and `role` for everything else. They're set once, before the widget is shown; Qt only
re-reads the stylesheet for a property change if the widget is re-polished.
"""

from PySide6.QtWidgets import QFrame, QLabel, QPushButton, QWidget

BUTTON_KINDS = ("primary", "secondary", "quiet", "danger")


def button(text: str, kind: str = "secondary", parent: QWidget | None = None) -> QPushButton:
    """SPEC 5.2.5: one primary per area, then secondary, quiet or danger."""
    if kind not in BUTTON_KINDS:
        raise ValueError(f"unknown button kind: {kind}")
    b = QPushButton(text, parent)
    b.setProperty("kind", kind)
    return b


def page_title(text: str, parent: QWidget | None = None) -> QLabel:
    """IM Fell, 26 px. Keep numbers out of it (SPEC 5.3): put them in a caption beside."""
    return _label(text, "page-title", parent)


def panel_heading(text: str, parent: QWidget | None = None) -> QLabel:
    """IM Fell small caps, 20 px."""
    return _label(text, "panel-heading", parent)


def muted(text: str, parent: QWidget | None = None) -> QLabel:
    return _label(text, "muted", parent)


def caption(text: str, parent: QWidget | None = None) -> QLabel:
    return _label(text, "caption", parent)


def frame(role: str, parent: QWidget | None = None) -> QFrame:
    """A styled container: "page" (red margin) or "panel" (paper-alt card)."""
    f = QFrame(parent)
    f.setProperty("role", role)
    return f


def _label(text: str, role: str, parent: QWidget | None) -> QLabel:
    label = QLabel(text, parent)
    label.setProperty("role", role)
    return label
