"""P1 task 11: Pack kit, Unpack kit and the end-of-session nudge, through the window.

The file dialogs and choices are answered by replacing KitActions.ask_* in each test;
everything else (zip, checks, file moves, local.json) is real, under tmp_path.
"""

import json
import shutil

import pytest
from PySide6.QtCore import Qt

from satchel.ui.main_window import MainWindow


@pytest.fixture
def window(qtbot, tmp_path, demo_path):
    """A main window whose data folder holds a copy of the demo, opened."""
    data = tmp_path / "data"
    data.mkdir()
    shutil.copyfile(demo_path, data / "wren-ashdown.satchel")
    w = MainWindow(data)
    qtbot.addWidget(w)
    assert w.open_character(data / "wren-ashdown.satchel")
    w.show()
    yield w
    w.close()


def answer(window, monkeypatch, **answers):
    for name, value in answers.items():
        monkeypatch.setattr(window.kits, f"ask_{name}", lambda *a, v=value, **k: v)


def pack_to(window, monkeypatch, path):
    answer(window, monkeypatch, save_path=path)
    return window.kits.pack()


def latest_note_texts(path, n=1):
    import sqlite3

    conn = sqlite3.connect(path)
    rows = conn.execute("SELECT text FROM notes ORDER BY created_at DESC LIMIT ?", (n,))
    texts = [r[0] for r in rows]
    conn.close()
    return texts


# --- Pack --------------------------------------------------------------------------------


def test_pack_writes_the_kit_and_records_it(window, monkeypatch, tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    dest = pack_to(window, monkeypatch, out / "wren.kit")
    assert dest.exists()
    assert window.messages().text.text() == "Kit packed: wren.kit"
    saved = json.loads((window.data_dir / "local.json").read_text())
    assert saved["last_packed_at"][window.store.character_id]
    assert saved["last_kit_folder"] == str(out)


def test_suggested_name_follows_the_spec(window, monkeypatch):
    seen = []
    monkeypatch.setattr(window.kits, "ask_save_path", lambda p: seen.append(p) or None)
    window.kits.pack()
    assert seen[0].name.startswith("wren-ashdown-") and seen[0].suffix == ".kit"


def test_failed_pack_is_reported_and_not_recorded(window, monkeypatch, tmp_path):
    assert pack_to(window, monkeypatch, tmp_path / "no-such-folder" / "x.kit") is None
    assert window.messages().tone == "err"
    assert window.store.character_id not in window.state.last_packed_at


# --- Nudge (SPEC 7.3) ----------------------------------------------------------------------


def test_ending_a_session_with_unpacked_changes_nudges(window, qtbot):
    strip = window.table.strip
    qtbot.mouseClick(strip.start, Qt.MouseButton.LeftButton)
    qtbot.keyClicks(window.table.capture, "a note worth packing")
    qtbot.keyClick(window.table.capture, Qt.Key.Key_Return)
    qtbot.mouseClick(strip.end, Qt.MouseButton.LeftButton)
    bar = window.messages()
    assert bar.tone == "warn" and bar.text.text() == "Session over. Pack your kit before you go?"
    assert [b.text() for b in bar._buttons] == ["Pack kit", "Not now"]
    qtbot.mouseClick(bar._buttons[1], Qt.MouseButton.LeftButton)
    assert bar.tone == "none", "Not now just clears the bar"


def test_no_nudge_when_nothing_changed_since_packing(window, monkeypatch, tmp_path):
    pack_to(window, monkeypatch, tmp_path / "w.kit")
    assert window.kits.nudge_if_unpacked() is False


def test_nudge_pack_button_packs(window, monkeypatch, tmp_path, qtbot):
    answer(window, monkeypatch, save_path=tmp_path / "from-nudge.kit")
    assert window.kits.nudge_if_unpacked()
    qtbot.mouseClick(window.messages()._buttons[0], Qt.MouseButton.LeftButton)
    assert (tmp_path / "from-nudge.kit").exists()


# --- Unpack ------------------------------------------------------------------------------


def test_unpack_refuses_a_file_that_is_not_a_kit(window, monkeypatch, tmp_path):
    junk = tmp_path / "junk.kit"
    junk.write_text("not a zip")
    answer(window, monkeypatch, open_path=junk)
    assert window.kits.unpack() is None
    assert window.messages().text.text() == "That file isn't a kit."


def test_unpack_add_as_new_opens_the_copy(window, monkeypatch, tmp_path):
    kit = pack_to(window, monkeypatch, tmp_path / "w.kit")
    original_id = window.store.character_id
    offered = []
    monkeypatch.setattr(
        window.kits,
        "ask_unpack_choice",
        lambda body, can_replace: offered.append(can_replace) or "new",
    )
    answer(window, monkeypatch, open_path=kit)
    path = window.kits.unpack()
    assert offered == [True], "same character is here, so Replace is offered too"
    assert path.name == "wren-ashdown-2.satchel"
    assert window.store.path == path
    assert window.store.character_id != original_id, "the copy gets its own identity"
    assert window.messages().text.text() == "Unpacked Wren Ashdown as a new character."


def test_unpack_replace_parks_the_old_copy(window, monkeypatch, tmp_path, qtbot):
    kit = pack_to(window, monkeypatch, tmp_path / "w.kit")
    window.store.save_note("typed after packing")
    confirm_args = []
    answer(window, monkeypatch, open_path=kit, unpack_choice="replace")
    monkeypatch.setattr(
        window.kits, "ask_confirm_replace", lambda name, newer: confirm_args.append(newer) or True
    )
    parked = window.kits.unpack()
    assert confirm_args == [True], "warned: this computer's copy is newer than the kit"
    assert parked.parent == window.data_dir / "replaced"
    assert latest_note_texts(parked) == ["typed after packing"]
    assert "typed after packing" not in latest_note_texts(window.store.path, 3)
    assert window.store.path == window.data_dir / "wren-ashdown.satchel", "reopened"


def test_replace_cancelled_at_the_confirm_changes_nothing(window, monkeypatch, tmp_path):
    kit = pack_to(window, monkeypatch, tmp_path / "w.kit")
    window.store.save_note("keep me")
    answer(window, monkeypatch, open_path=kit, unpack_choice="replace", confirm_replace=False)
    assert window.kits.unpack() is None
    assert window.store is not None and latest_note_texts(window.store.path) == ["keep me"]
    assert not (window.data_dir / "replaced").exists()


def test_welcome_and_tray_offer_kits(qtbot, tmp_path):
    w = MainWindow(tmp_path)
    qtbot.addWidget(w)
    assert w.welcome.unpack_button.text() == "Unpack kit"
    assert [a.text() for a in w.menuBar().actions()[0].menu().actions() if a.text()][2:4] == [
        "Pack kit…",
        "Unpack kit…",
    ]
    w.close()
