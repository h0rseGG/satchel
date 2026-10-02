"""The main window: File menu, Welcome or Table page, one open character at a time.

Opening (SPEC 5.1, approved 2026-10-02): start with the character opened last
(local.json); if there isn't one, the Welcome page. File › Open character lists the
.satchel files in the data folder.
"""

from pathlib import Path

from PySide6.QtCore import QByteArray
from PySide6.QtGui import QAction, QCloseEvent
from PySide6.QtWidgets import QMainWindow, QMenu, QStackedWidget

from satchel.db.migrate import SchemaTooNewError
from satchel.files.kits import list_characters
from satchel.files.local_state import LocalState, load_state, save_state
from satchel.ui import strings
from satchel.ui.dialogs import NameDialog
from satchel.ui.pages import WelcomePage
from satchel.ui.store import CharacterStore, Clock, create_character_file, system_clock
from satchel.ui.table import TableView


class MainWindow(QMainWindow):
    def __init__(self, data_dir: Path, clock: Clock = system_clock):
        super().__init__()
        self.data_dir = Path(data_dir)
        self.clock = clock
        self.state: LocalState = load_state(self.data_dir)
        self.store: CharacterStore | None = None

        self.welcome = WelcomePage()
        self.welcome.new_character.connect(self.new_character)
        self.table = TableView()
        self.pages = QStackedWidget()
        self.pages.addWidget(self.welcome)
        self.pages.addWidget(self.table)
        self.setCentralWidget(self.pages)
        self._build_menu()

        self.resize(1100, 720)
        if self.state.window_geometry:
            self.restoreGeometry(QByteArray.fromBase64(self.state.window_geometry.encode()))
        self._open_last()

    # --- Menu --------------------------------------------------------------------------

    def _build_menu(self) -> None:
        menu = self.menuBar().addMenu(strings.FILE_MENU)
        new = QAction(strings.NEW_CHARACTER + "…", self)
        new.triggered.connect(self.new_character)
        menu.addAction(new)
        self.open_menu = QMenu(strings.OPEN_CHARACTER, self)
        # Rebuilt each time it opens, so a file added or unpacked meanwhile shows up.
        self.open_menu.aboutToShow.connect(self._fill_open_menu)
        menu.addMenu(self.open_menu)
        menu.addSeparator()
        quit_action = QAction(strings.QUIT, self)
        quit_action.triggered.connect(self.close)
        menu.addAction(quit_action)

    def _fill_open_menu(self) -> None:
        self.open_menu.clear()
        characters = list_characters(self.data_dir) if self.data_dir.exists() else []
        if not characters:
            empty = self.open_menu.addAction(strings.NO_CHARACTERS)
            empty.setEnabled(False)
            return
        for identity in characters:
            label = identity.character_name or identity.path.stem
            action = self.open_menu.addAction(f"{label}  ({identity.path.name})")
            action.setCheckable(True)
            action.setChecked(bool(self.store and self.store.path == identity.path))
            action.triggered.connect(lambda _=False, p=identity.path: self.open_character(p))

    # --- Opening characters ------------------------------------------------------------

    def _open_last(self) -> None:
        name = self.state.last_character
        if not name:
            self._show_welcome()
            return
        path = self.data_dir / name
        if not path.exists():
            self._show_welcome()
            self.messages().show_message(
                strings.LAST_CHARACTER_MISSING.format(file_name=name), "warn"
            )
            return
        self.open_character(path)

    def open_character(self, path: Path) -> bool:
        """Close whatever is open and open `path`. On failure the old one stays closed
        and the Welcome page explains why."""
        self._close_store()
        try:
            self.store = CharacterStore(path, self.clock, parent=self)
        except SchemaTooNewError:
            return self._open_failed(strings.OPEN_TOO_NEW.format(file_name=path.name))
        except Exception as e:  # any other failure: say so and stay up, never crash
            return self._open_failed(strings.OPEN_FAILED.format(file_name=path.name) + f" ({e})")
        self.state.last_character = path.name
        save_state(self.data_dir, self.state)
        self.setWindowTitle(f"{self.store.character_name} — {strings.APP_NAME}")
        self.table.set_store(self.store)
        self.pages.setCurrentWidget(self.table)
        self.messages().clear()
        self.table.capture.setFocus()
        return True

    def _open_failed(self, message: str) -> bool:
        self.store = None
        self._show_welcome()
        self.messages().show_message(message, "err")
        return False

    def messages(self):
        """The message bar of the page on show."""
        return self.pages.currentWidget().message_bar

    def _show_welcome(self) -> None:
        self.setWindowTitle(strings.APP_NAME)
        self.pages.setCurrentWidget(self.welcome)

    def new_character(self) -> None:
        dialog = NameDialog(
            self, strings.NEW_CHARACTER_TITLE, strings.NEW_CHARACTER_LABEL, strings.CREATE
        )
        if dialog.exec() == NameDialog.DialogCode.Accepted:
            self.create_character(dialog.name())

    def create_character(self, name: str) -> Path:
        path = create_character_file(self.data_dir, name, self.clock)
        self.open_character(path)
        return path

    # --- Window -------------------------------------------------------------------------

    def bring_to_front(self) -> None:
        """Show, un-minimise and focus (a second launch or the tray asks for this)."""
        self.showNormal()
        self.raise_()
        self.activateWindow()

    def _close_store(self) -> None:
        self.table.set_store(None)
        if self.store:
            self.store.close()
            self.store.deleteLater()
            self.store = None

    def closeEvent(self, event: QCloseEvent) -> None:
        self.state.window_geometry = bytes(self.saveGeometry().toBase64().data()).decode()
        save_state(self.data_dir, self.state)
        self._close_store()
        super().closeEvent(event)
