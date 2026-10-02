"""Start Satchel: one copy only, the theme, the main window."""

import sys

from PySide6.QtWidgets import QApplication

from satchel import __version__
from satchel.ui import strings
from satchel.ui.main_window import MainWindow
from satchel.ui.single_instance import SingleInstance
from satchel.ui.theme import apply_theme


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName(strings.APP_NAME)
    app.setApplicationVersion(__version__)

    instance = SingleInstance(parent=app)  # parented: Qt frees it before shutting down
    if not instance.is_primary:
        return 0  # the running copy has been asked to show itself

    apply_theme(app)
    window = MainWindow()
    instance.show_requested.connect(window.bring_to_front)
    window.show()
    code = app.exec()
    instance.close()
    return code


if __name__ == "__main__":
    sys.exit(main())
