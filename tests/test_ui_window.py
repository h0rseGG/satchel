"""P1 task 5: main window, character open/create flow, message bar, dialogs.

Every test uses its own tmp_path as the data folder (never %LOCALAPPDATA%).
"""

import json
import sqlite3

import pytest
from PySide6.QtWidgets import QDialog

from satchel.ui.dialogs import NameDialog, confirm_dialog
from satchel.ui.main_window import MainWindow
from satchel.ui.message_bar import HEIGHT, MessageBar
from satchel.ui.store import create_character_file


@pytest.fixture
def window(qtbot, tmp_path):
    w = MainWindow(tmp_path)
    qtbot.addWidget(w)
    yield w
    w.close()


def test_first_run_shows_welcome(window):
    assert window.pages.currentWidget() is window.welcome
    assert window.windowTitle() == "Satchel"
    assert window.store is None


def test_new_character_opens_it_and_remembers_it(window, tmp_path):
    path = window.create_character("Wren Ashdown")
    assert path == tmp_path / "wren-ashdown.satchel" and path.exists()
    assert window.pages.currentWidget() is window.table
    assert window.windowTitle().startswith("Wren Ashdown")
    state = json.loads((tmp_path / "local.json").read_text())
    assert state["last_character"] == "wren-ashdown.satchel"


def test_next_start_opens_the_last_character(qtbot, tmp_path):
    first = MainWindow(tmp_path)
    qtbot.addWidget(first)
    first.create_character("Wren Ashdown")
    first.close()
    second = MainWindow(tmp_path)
    qtbot.addWidget(second)
    assert second.store is not None and second.store.character_name == "Wren Ashdown"
    second.close()


def test_missing_last_character_falls_back_to_welcome_with_a_warning(qtbot, tmp_path):
    (tmp_path / "local.json").write_text(json.dumps({"last_character": "gone.satchel"}))
    w = MainWindow(tmp_path)
    qtbot.addWidget(w)
    assert w.pages.currentWidget() is w.welcome
    assert w.messages().tone == "warn" and "gone.satchel" in w.messages().text.text()


def test_newer_file_is_not_opened(window, tmp_path):
    path = create_character_file(tmp_path, "Future")
    raw = sqlite3.connect(path)
    raw.execute("PRAGMA user_version = 99")
    raw.close()
    before = path.read_bytes()
    assert window.open_character(path) is False
    assert window.pages.currentWidget() is window.welcome
    assert window.messages().tone == "err"
    assert path.read_bytes() == before


def test_open_menu_lists_characters_and_ticks_the_open_one(window, tmp_path):
    window._fill_open_menu()
    assert [a.text() for a in window.open_menu.actions()] == ["No characters yet"]
    create_character_file(tmp_path, "Kael")
    window.create_character("Wren Ashdown")
    window._fill_open_menu()
    actions = window.open_menu.actions()
    assert [a.text().split("  ")[0] for a in actions] == ["Kael", "Wren Ashdown"]
    assert [a.isChecked() for a in actions] == [False, True]
    actions[0].trigger()
    assert window.store.character_name == "Kael"


def test_switching_characters_closes_the_old_file(window, tmp_path):
    a = window.create_character("Wren Ashdown")
    window.create_character("Kael")
    # A closed WAL database leaves no -wal file behind.
    assert not a.with_name(a.name + "-wal").exists()


def test_close_saves_window_geometry(qtbot, tmp_path):
    w = MainWindow(tmp_path)
    qtbot.addWidget(w)
    w.show()
    w.close()
    assert json.loads((tmp_path / "local.json").read_text())["window_geometry"]


# --- Message bar (lesson 6) ---------------------------------------------------------------


def test_message_never_moves_the_capture_area(window, qtbot):
    window.create_character("Wren Ashdown")
    window.show()
    qtbot.waitExposed(window)
    bar = window.table.message_bar
    before = bar.geometry()
    bar.show_message("Kit packed: x.kit", "ok", [("Not now", "quiet", lambda: None)])
    qtbot.wait(10)
    assert bar.geometry() == before and bar.height() == HEIGHT
    bar.clear()
    qtbot.wait(10)
    assert bar.geometry() == before and bar.isVisible()


def test_message_actions_run_and_clear_the_bar(qtbot):
    bar = MessageBar()
    qtbot.addWidget(bar)
    hits = []
    bar.show_message("Session over.", "warn", [("Pack kit", "primary", lambda: hits.append(1))])
    assert bar.tone == "warn"
    bar._buttons[0].click()
    assert hits == [1] and bar.tone == "none" and bar.text.text() == ""
    with pytest.raises(ValueError):
        bar.show_message("x", "loud")


# --- Dialogs ------------------------------------------------------------------------------


def test_name_dialog_needs_a_name(qtbot):
    d = NameDialog(None, "New character", "Name", "Create")
    qtbot.addWidget(d)
    assert not d.ok.isEnabled()
    d.field.setText("   ")
    assert not d.ok.isEnabled()
    d.field.setText("  Wren  ")
    assert d.ok.isEnabled() and d.name() == "Wren"


def test_confirm_dialog_is_safe_by_default(qtbot):
    d = confirm_dialog(None, "Replace Wren?", "This swaps in the kit.", "Replace")
    qtbot.addWidget(d)
    assert d.property("role") == "confirm"
    assert d.go_button.property("kind") == "danger"
    assert not d.go_button.isDefault() and not d.go_button.autoDefault()
    d.go_button.click()
    assert d.result() == QDialog.DialogCode.Accepted
