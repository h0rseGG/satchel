"""Start Satchel: one copy only, the theme, the main window."""

import sys

from PySide6.QtWidgets import QApplication

from satchel import __version__
from satchel.files import data_dir
from satchel.files.log import setup_logging
from satchel.ui import strings
from satchel.ui.hotkey import GlobalHotkey
from satchel.ui.icon import app_icon
from satchel.ui.main_window import MainWindow
from satchel.ui.quick_capture import QuickCapture
from satchel.ui.single_instance import SingleInstance
from satchel.ui.theme import apply_theme
from satchel.ui.tray import Tray


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName(strings.APP_NAME)
    app.setApplicationVersion(__version__)

    instance = SingleInstance(parent=app)  # parented: Qt frees it before shutting down
    if not instance.is_primary:
        return 0  # the running copy has been asked to show itself

    setup_logging(data_dir(), __version__)
    apply_theme(app)
    app.setWindowIcon(app_icon())
    # Closing the window keeps Satchel in the tray; only Quit ends it.
    app.setQuitOnLastWindowClosed(False)
    window = MainWindow(data_dir(), hide_on_close=True)
    instance.show_requested.connect(window.bring_to_front)

    quick = QuickCapture(window)
    window.tray = Tray(window, quick)
    window.tray.show()
    hotkey = GlobalHotkey(app)
    hotkey.pressed.connect(quick.toggle)
    if not hotkey.register(window.state.hotkey):
        window.messages().show_message(
            strings.HOTKEY_TAKEN.format(hotkey=window.state.hotkey), "warn"
        )

    app.aboutToQuit.connect(hotkey.close)
    app.aboutToQuit.connect(window.shutdown)
    window.show()
    code = app.exec()
    instance.close()
    return code


if __name__ == "__main__":
    sys.exit(main())
