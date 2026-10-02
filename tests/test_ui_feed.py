"""P1 task 7: the notes feed on a copy of the demo."""

import shutil

import pytest
from PySide6.QtCore import Qt
from PySide6.QtGui import QColor

from satchel.ui.main_window import MainWindow
from satchel.ui.palette import COLOURS


@pytest.fixture
def window(qtbot, tmp_path, demo_path):
    copy = tmp_path / "wren.satchel"
    shutil.copyfile(demo_path, copy)
    w = MainWindow(tmp_path / "data")
    qtbot.addWidget(w)
    assert w.open_character(copy)
    w.show()
    qtbot.waitExposed(w)
    yield w
    w.close()


def feed(window):
    return window.table.notes


def test_between_sessions_feed_shows_notes_since_the_last_session(window):
    # The demo's last session started 26 Sept; one between-sessions note came after.
    assert feed(window).row_texts() == ["idea: ask Bess for disguises before the docks"]
    assert not feed(window).empty.isVisibleTo(window)


def test_empty_feed_shows_the_hint(window):
    window.store.start_session()
    assert feed(window).rows == []
    assert feed(window).empty.isVisibleTo(window)


def test_new_note_appears_at_the_bottom_with_labels(window, qtbot):
    box = window.table.capture
    qtbot.keyClicks(box, "met @Pip and grimbold #debts")
    qtbot.keyClick(box, Qt.Key.Key_Return)
    qtbot.keyClicks(box, "second note")
    qtbot.keyClick(box, Qt.Key.Key_Return)
    assert feed(window).row_texts()[-2:] == [
        "met Pip and Grimbold #debts",
        "second note",
    ]  # spelled the entity's way (4.6.0)


def test_link_kinds_are_drawn_differently(window, qtbot):
    box = window.table.capture
    qtbot.keyClicks(box, "met @Pip and grimbold #debts")
    qtbot.keyClick(box, Qt.Key.Key_Return)
    doc = feed(window).rows[-1].text.doc
    formats = {}
    block = doc.firstBlock()
    it = block.begin()
    while not it.atEnd():
        frag = it.fragment()
        formats[frag.text()] = frag.charFormat()
        it += 1
    assert formats["Pip"].background().color() == QColor(COLOURS["highlight"])
    assert formats["Grimbold"].fontUnderline()
    assert formats["Grimbold"].underlineColor() == QColor(COLOURS["ink-muted"])
    assert formats["#debts"].foreground().color() == QColor(COLOURS["ink-muted"])


def test_in_session_feed_shows_only_that_session(window, qtbot):
    box = window.table.capture
    qtbot.keyClicks(box, "before")
    qtbot.keyClick(box, Qt.Key.Key_Return)
    window.store.start_session()
    assert feed(window).rows == []
    qtbot.keyClicks(box, "in session")
    qtbot.keyClick(box, Qt.Key.Key_Return)
    assert feed(window).row_texts() == ["in session"]


def test_clicking_a_note_edits_it(window, qtbot):
    box = window.table.capture
    qtbot.keyClicks(box, "grimbold lent 20gp")
    qtbot.keyClick(box, Qt.Key.Key_Return)
    row = feed(window).rows[-1]
    qtbot.mouseClick(row, Qt.MouseButton.LeftButton)
    assert box.editing_note_id == row.note.id
    assert box.toPlainText() == "grimbold lent 20gp"


def test_rows_show_local_times(window, qtbot):
    box = window.table.capture
    qtbot.keyClicks(box, "a note")
    qtbot.keyClick(box, Qt.Key.Key_Return)
    label = feed(window).rows[-1].findChildren(type(feed(window).empty))[0].text()
    assert label.endswith(("am", "pm"))


def test_rebuilding_leaves_only_current_rows_visible(window, qtbot):
    box = window.table.capture
    window.store.start_session()
    for text in ["one", "two", "three"]:
        qtbot.keyClicks(box, text)
        qtbot.keyClick(box, Qt.Key.Key_Return)
    from satchel.ui.feed import NoteRowView

    qtbot.wait(20)  # one pass of the event loop: Qt shows new rows then
    visible = [r for r in feed(window).findChildren(NoteRowView) if r.isVisible()]
    assert sorted(r.note.text for r in visible) == ["one", "three", "two"]
