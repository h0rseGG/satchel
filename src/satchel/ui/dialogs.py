"""The app's only dialogs (SPEC 5.2.2): one confirm for destructive actions, and one
small prompt for a name. Everything else happens in place."""

from PySide6.QtWidgets import QDialog, QHBoxLayout, QLabel, QLineEdit, QVBoxLayout, QWidget

from satchel.ui import strings
from satchel.ui.components import button, page_title
from satchel.ui.palette import SPACE


def _frame(dialog: QDialog, title: str) -> QVBoxLayout:
    """Every dialog looks the same: title, then content, then a right-aligned button row."""
    dialog.setWindowTitle(title)
    dialog.setMinimumWidth(420)
    layout = QVBoxLayout(dialog)
    layout.setContentsMargins(SPACE["xl"], SPACE["l"], SPACE["xl"], SPACE["l"])
    layout.setSpacing(SPACE["m"])
    layout.addWidget(page_title(title))
    return layout


def _button_row(layout: QVBoxLayout, *buttons) -> None:
    row = QHBoxLayout()
    row.addStretch()
    for b in buttons:
        row.addWidget(b)
    layout.addLayout(row)


class NameDialog(QDialog):
    """Ask for one name, e.g. a new character's. `name()` after exec() == Accepted."""

    def __init__(self, parent: QWidget | None, title: str, label: str, action: str):
        super().__init__(parent)
        layout = _frame(self, title)
        layout.addWidget(QLabel(label))
        self.field = QLineEdit()
        layout.addWidget(self.field)
        self.ok = button(action, "primary")
        cancel = button(strings.CANCEL, "quiet")
        _button_row(layout, cancel, self.ok)
        self.ok.setDefault(True)
        self.ok.setEnabled(False)
        self.field.textChanged.connect(lambda t: self.ok.setEnabled(bool(t.strip())))
        self.ok.clicked.connect(self.accept)
        cancel.clicked.connect(self.reject)

    def name(self) -> str:
        return self.field.text().strip()


def choice_dialog(
    parent: QWidget | None, title: str, body: str, choices: list[tuple[str, str, str]]
) -> QDialog:
    """A few labelled ways forward, e.g. Unpack's Add as new / Replace. `choices` are
    (key, label, button kind); Cancel is always added. After exec(), `chosen` holds the
    key, or None for Cancel. Not a confirm: a destructive choice still confirms."""
    dialog = QDialog(parent)
    layout = _frame(dialog, title)
    text = QLabel(body)
    text.setWordWrap(True)
    layout.addWidget(text)
    dialog.chosen = None
    dialog.buttons = {}
    cancel = button(strings.CANCEL, "quiet")
    cancel.clicked.connect(dialog.reject)
    row = []
    for key, label, kind in choices:
        b = button(label, kind)
        b.setAutoDefault(False)
        b.clicked.connect(lambda _=False, k=key: (setattr(dialog, "chosen", k), dialog.accept()))
        dialog.buttons[key] = b
        row.append(b)
    _button_row(layout, cancel, *row)
    return dialog


def confirm_dialog(parent: QWidget | None, title: str, body: str, action: str) -> QDialog:
    """Build the confirm dialog (tests drive it directly). The destructive button is
    red-filled here and only here (SPEC 5.3); Cancel has the focus, so a stray Enter
    never destroys anything."""
    dialog = QDialog(parent)
    dialog.setProperty("role", "confirm")
    layout = _frame(dialog, title)
    text = QLabel(body)
    text.setWordWrap(True)
    layout.addWidget(text)
    go = button(action, "danger")
    cancel = button(strings.CANCEL, "secondary")
    _button_row(layout, cancel, go)
    go.setAutoDefault(False)
    cancel.setDefault(True)
    cancel.setFocus()
    go.clicked.connect(dialog.accept)
    cancel.clicked.connect(dialog.reject)
    dialog.go_button = go  # for tests
    return dialog


def confirm_destructive(parent: QWidget | None, title: str, body: str, action: str) -> bool:
    """SPEC 5.2.2: the one confirm, only for delete, Replace and delete type."""
    return confirm_dialog(parent, title, body, action).exec() == QDialog.DialogCode.Accepted
