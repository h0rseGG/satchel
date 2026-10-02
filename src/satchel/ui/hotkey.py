"""The global quick-capture key (SPEC 2, 5.1): Win32 RegisterHotKey via ctypes, caught
with a Qt native event filter. Windows only, like the rest of P1's desktop glue.

The key is registered against a hidden window of our own, so Windows posts WM_HOTKEY
to that window and Qt hands the message to our filter. If another app already owns
the key, RegisterHotKey fails and the caller says so (never a crash).
"""

import ctypes
from ctypes import wintypes

from PySide6.QtCore import QAbstractNativeEventFilter, QObject, Signal
from PySide6.QtWidgets import QApplication, QWidget

WM_HOTKEY = 0x0312
MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN, MOD_NOREPEAT = 0x1, 0x2, 0x4, 0x8, 0x4000
HOTKEY_ID = 0x5A7C  # any id unique within this app

_MODIFIERS = {"ctrl": MOD_CONTROL, "alt": MOD_ALT, "shift": MOD_SHIFT, "win": MOD_WIN}
_NAMED_KEYS = {"space": 0x20, "enter": 0x0D, "tab": 0x09, "backspace": 0x08}


def parse_hotkey(text: str) -> tuple[int, int]:
    """ "Ctrl+Alt+N" -> (MOD_CONTROL | MOD_ALT, ord("N")). Needs at least one modifier
    and exactly one key: a letter, a digit, F1-F24 or a named key. Raises ValueError."""
    parts = [p.strip().lower() for p in text.split("+") if p.strip()]
    mods = 0
    keys = []
    for p in parts:
        if p in _MODIFIERS:
            mods |= _MODIFIERS[p]
        else:
            keys.append(p)
    if not mods or len(keys) != 1:
        raise ValueError(f"not a hotkey: {text!r}")
    key = keys[0]
    if len(key) == 1 and key.isascii() and key.isalnum():
        vk = ord(key.upper())  # VK codes for A-Z and 0-9 are their ASCII codes
    elif key.startswith("f") and key[1:].isdigit() and 1 <= int(key[1:]) <= 24:
        vk = 0x70 + int(key[1:]) - 1  # VK_F1 = 0x70
    elif key in _NAMED_KEYS:
        vk = _NAMED_KEYS[key]
    else:
        raise ValueError(f"unknown key in hotkey: {key!r}")
    return mods, vk


class _Filter(QAbstractNativeEventFilter):
    def __init__(self, hwnd: int, on_hotkey):
        super().__init__()
        self.hwnd = hwnd
        self.on_hotkey = on_hotkey

    def nativeEventFilter(self, event_type, message):  # noqa: N802 - Qt's name
        if bytes(event_type) == b"windows_generic_MSG":
            msg = wintypes.MSG.from_address(int(message))
            # Every filter sees every message: only take our own window's.
            if msg.message == WM_HOTKEY and msg.wParam == HOTKEY_ID and msg.hWnd == self.hwnd:
                self.on_hotkey()
                return True, 0
        return False, 0


class GlobalHotkey(QObject):
    """Emits `pressed` when the key is pressed anywhere in Windows."""

    pressed = Signal()

    def __init__(self, parent: QObject | None = None):
        super().__init__(parent)
        self._window = QWidget()  # never shown; only its native handle is used
        self.hwnd = int(self._window.winId())
        self._filter = _Filter(self.hwnd, self.pressed.emit)
        QApplication.instance().installNativeEventFilter(self._filter)
        self.registered = False

    def register(self, text: str) -> bool:
        """Claim the key. False if it's malformed or another app already has it."""
        self.unregister()
        try:
            mods, vk = parse_hotkey(text)
        except ValueError:
            return False
        user32 = ctypes.windll.user32
        self.registered = bool(
            user32.RegisterHotKey(wintypes.HWND(self.hwnd), HOTKEY_ID, mods | MOD_NOREPEAT, vk)
        )
        return self.registered

    def unregister(self) -> None:
        if self.registered:
            ctypes.windll.user32.UnregisterHotKey(wintypes.HWND(self.hwnd), HOTKEY_ID)
            self.registered = False

    def close(self) -> None:
        self.unregister()
        QApplication.instance().removeNativeEventFilter(self._filter)
        self._window.deleteLater()
