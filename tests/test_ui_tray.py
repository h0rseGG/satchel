"""P1 task 10: global hotkey, Quick capture, tray and hide-to-tray (Windows only).

The hotkey test never presses real keys: it posts WM_HOTKEY to our own hidden window,
and uses an obscure key (Ctrl+Alt+Shift+F23) so it can't clash with a running Satchel.
"""

import ctypes
from ctypes import wintypes

import pytest
from PySide6.QtCore import Qt

from satchel.ui.hotkey import (
    HOTKEY_ID,
    MOD_ALT,
    MOD_CONTROL,
    MOD_SHIFT,
    WM_HOTKEY,
    GlobalHotkey,
    parse_hotkey,
)
from satchel.ui.icon import app_icon
from satchel.ui.main_window import MainWindow
from satchel.ui.quick_capture import QuickCapture
from satchel.ui.tray import Tray

TEST_KEY = "Ctrl+Alt+Shift+F23"


@pytest.mark.parametrize(
    ("text", "parsed"),
    [
        ("Ctrl+Alt+N", (MOD_CONTROL | MOD_ALT, ord("N"))),
        ("ctrl + shift + space", (MOD_CONTROL | MOD_SHIFT, 0x20)),
        ("Alt+F2", (MOD_ALT, 0x71)),
        ("Ctrl+Alt+7", (MOD_CONTROL | MOD_ALT, ord("7"))),
    ],
)
def test_parse_hotkey(text, parsed):
    assert parse_hotkey(text) == parsed


@pytest.mark.parametrize("text", ["N", "Ctrl+Alt", "Ctrl+A+B", "Ctrl+F99", "Ctrl+é"])
def test_parse_hotkey_refuses(text):
    with pytest.raises(ValueError):
        parse_hotkey(text)


def test_hotkey_fires_and_a_taken_key_is_refused(qtbot):
    first = GlobalHotkey()
    second = GlobalHotkey()
    try:
        assert first.register(TEST_KEY)
        assert not second.register(TEST_KEY), "another owner of the key is detected"
        assert not second.register("not a key")
        with qtbot.waitSignal(first.pressed, timeout=2000):
            ctypes.windll.user32.PostMessageW(wintypes.HWND(first.hwnd), WM_HOTKEY, HOTKEY_ID, 0)
    finally:
        first.close()
        second.close()
    qtbot.wait(10)


# --- Quick capture and tray ---------------------------------------------------------------


@pytest.fixture
def window(qtbot, tmp_path):
    w = MainWindow(tmp_path)
    qtbot.addWidget(w)
    w.create_character("Wren Ashdown")
    yield w
    w.close()


@pytest.fixture
def quick(qtbot, window):
    q = QuickCapture(window)
    qtbot.addWidget(q)
    return q


def test_quick_capture_saves_into_the_current_session_and_closes(window, quick, qtbot):
    session = window.store.start_session()
    quick.open()
    assert quick.isVisible() and quick.where.text().endswith("Session 1")
    qtbot.keyClicks(quick.box, "heard about the barrow #clue")
    qtbot.keyClick(quick.box, Qt.Key.Key_Return)
    assert not quick.isVisible()
    [row] = window.store.feed_notes()
    assert (row.text, row.session_id) == ("heard about the barrow #clue", session.id)
    assert window.table.notes.row_texts() == ["heard about the barrow #clue"], "feed updates"


def test_quick_capture_escape_closes_and_keeps_the_text(window, quick, qtbot):
    quick.open()
    assert quick.where.text().endswith("Between sessions")
    qtbot.keyClicks(quick.box, "half a thought")
    qtbot.keyClick(quick.box, Qt.Key.Key_Escape)
    assert not quick.isVisible()
    assert window.store.feed_notes() == []
    quick.open()
    assert quick.box.toPlainText() == "half a thought"


def test_quick_capture_with_no_character_opens_the_main_window(qtbot, tmp_path):
    w = MainWindow(tmp_path)
    qtbot.addWidget(w)
    q = QuickCapture(w)
    qtbot.addWidget(q)
    q.open()
    assert not q.isVisible() and w.isVisible()
    w.close()


def test_close_hides_to_the_tray_and_keeps_the_file_open(qtbot, tmp_path):
    w = MainWindow(tmp_path, hide_on_close=True)
    qtbot.addWidget(w)
    w.create_character("Wren Ashdown")
    w.show()
    w.close()
    assert not w.isVisible() and w.store is not None, "still running for quick capture"
    w.shutdown()
    assert w.store is None
    w.close()


def test_tray_menu_and_icon(window, quick):
    tray = Tray(window, quick)
    assert list(tray.actions_by_name) == ["open", "quick", "pack", "quit"]
    tray.actions_by_name["open"].trigger()
    assert window.isVisible()
    assert not app_icon().pixmap(32, 32).isNull()
