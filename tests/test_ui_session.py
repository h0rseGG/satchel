"""P1 task 9: AutosaveLineEdit (SPEC 5.2.1) and the session strip (SPEC 6)."""

import pytest
from PySide6.QtCore import Qt

from satchel.ui.autosave import AUTOSAVE_MS, AutosaveLineEdit
from satchel.ui.main_window import MainWindow

# --- AutosaveLineEdit -------------------------------------------------------------------


@pytest.fixture
def field(qtbot):
    saved = []
    f = AutosaveLineEdit(saved.append)
    qtbot.addWidget(f)
    f.show()
    f.setFocus()
    f.saved = saved
    return f


def test_saves_after_typing_stops(field, qtbot):
    qtbot.keyClicks(field, "The mill")
    assert field.saved == []
    qtbot.wait(AUTOSAVE_MS + 200)
    assert field.saved == ["The mill"]


def test_enter_saves_at_once_and_same_value_is_a_no_op(field, qtbot):
    qtbot.keyClicks(field, "The mill")
    qtbot.keyClick(field, Qt.Key.Key_Return)
    qtbot.keyClick(field, Qt.Key.Key_Return)
    qtbot.wait(AUTOSAVE_MS + 200)
    assert field.saved == ["The mill"]


def test_outside_update_never_overwrites_typing(field, qtbot):
    field.set_value("Old")
    qtbot.keyClicks(field, " and new")
    field.set_value("From elsewhere")
    assert field.text() == "Old and new"


def test_outside_update_shows_when_not_typing(field):
    field.clearFocus()
    field.set_value("From the store")
    assert field.text() == "From the store"


# --- Session strip ------------------------------------------------------------------------


@pytest.fixture
def window(qtbot, tmp_path):
    w = MainWindow(tmp_path)
    qtbot.addWidget(w)
    w.create_character("Wren Ashdown")
    w.show()
    qtbot.waitExposed(w)
    yield w
    w.close()


def strip(window):
    return window.table.strip


def test_between_sessions_shows_start_only(window):
    s = strip(window)
    assert s.heading.text() == "Between sessions"
    assert s.start.isVisible() and not s.end.isVisible() and not s.title.isVisible()


def test_start_session_shows_number_date_and_end(window, qtbot):
    s = strip(window)
    qtbot.mouseClick(s.start, Qt.MouseButton.LeftButton)
    assert (s.heading.text(), s.number.text()) == ("Session", "1")
    assert s.date.text()  # e.g. "Sat 3 Oct 2026"
    assert s.end.isVisible() and not s.start.isVisible()
    assert window.table.capture.hasFocus(), "back to typing straight away"


def test_title_saves_to_the_session(window, qtbot):
    s = strip(window)
    qtbot.mouseClick(s.start, Qt.MouseButton.LeftButton)
    s.title.setFocus()
    qtbot.keyClicks(s.title, "Into the mill")
    qtbot.keyClick(s.title, Qt.Key.Key_Return)
    assert window.store.current_session().title == "Into the mill"


def test_end_session_goes_back_to_between(window, qtbot):
    s = strip(window)
    qtbot.mouseClick(s.start, Qt.MouseButton.LeftButton)
    qtbot.mouseClick(s.end, Qt.MouseButton.LeftButton)
    assert window.store.current_session() is None
    assert s.start.isVisible() and s.heading.text() == "Between sessions"


def test_a_title_being_typed_is_saved_when_the_session_ends(window, qtbot):
    s = strip(window)
    qtbot.mouseClick(s.start, Qt.MouseButton.LeftButton)
    session_id = window.store.current_session().id
    s.title.setFocus()
    qtbot.keyClicks(s.title, "Half typed")
    window.store.end_session()  # ends before the autosave timer fires
    row = window.store.conn.execute("SELECT title FROM sessions WHERE id = ?", (session_id,))
    assert row.fetchone()[0] == "Half typed"


def test_session_survives_a_restart(qtbot, tmp_path):
    w = MainWindow(tmp_path)
    qtbot.addWidget(w)
    w.create_character("Wren Ashdown")
    w.store.start_session()
    w.close()
    again = MainWindow(tmp_path)
    qtbot.addWidget(again)
    assert again.table.strip.number.text() == "1"
    again.close()
