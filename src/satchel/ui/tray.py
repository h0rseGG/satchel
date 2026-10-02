"""The tray icon (SPEC 5.1): open, quick capture, pack kit, quit.
Clicking the icon opens the main window. Closing the main window only hides it, so
the hotkey keeps working; Quit is here and in the File menu."""

from PySide6.QtGui import QAction
from PySide6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

from satchel.ui import strings
from satchel.ui.icon import app_icon


class Tray(QSystemTrayIcon):
    def __init__(self, main_window, quick_capture):
        super().__init__(app_icon(), main_window)
        self.main = main_window
        self.setToolTip(strings.APP_NAME)
        menu = QMenu()
        self._menu = menu  # QSystemTrayIcon doesn't own its menu; keep it alive
        self.actions_by_name: dict[str, QAction] = {}
        for name, label, slot in [
            ("open", strings.OPEN_SATCHEL, main_window.bring_to_front),
            ("quick", strings.QUICK_CAPTURE, quick_capture.open),
            ("pack", strings.PACK_KIT + "…", main_window.pack_kit),
            ("quit", strings.QUIT, QApplication.quit),
        ]:
            action = QAction(label, menu)
            action.triggered.connect(slot)
            menu.addAction(action)
            self.actions_by_name[name] = action
            if name == "pack":
                menu.addSeparator()
        self.setContextMenu(menu)
        self.activated.connect(self._on_activated)

    def _on_activated(self, reason: QSystemTrayIcon.ActivationReason) -> None:
        if reason in (
            QSystemTrayIcon.ActivationReason.Trigger,
            QSystemTrayIcon.ActivationReason.DoubleClick,
        ):
            self.main.bring_to_front()
