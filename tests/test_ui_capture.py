"""P1 task 6: the CaptureBox, driven by real key presses on a copy of the demo."""

import shutil

import pytest
from PySide6.QtCore import QMimeData, Qt
from PySide6.QtGui import QColor

from satchel.ui.capture import MAX_LINES
from satchel.ui.main_window import MainWindow
from satchel.ui.palette import COLOURS


@pytest.fixture
def window(qtbot, tmp_path, demo_path):
    """The main window with a private copy of the demo open, shown and focused."""
    copy = tmp_path / "wren.satchel"
    shutil.copyfile(demo_path, copy)
    w = MainWindow(tmp_path / "data")
    qtbot.addWidget(w)
    assert w.open_character(copy)
    w.show()
    qtbot.waitExposed(w)
    w.table.capture.setFocus()
    yield w
    w.close()


@pytest.fixture
def box(window):
    return window.table.capture


def note_count(window) -> int:
    return window.store.conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]


def test_at_suggests_and_tab_picks_then_typing_carries_on(box, qtbot):
    qtbot.keyClicks(box, "paid @Grimb")
    labels = box.suggestion_labels()
    # The demo's newer candidate "Grimbol" (a typo) is listed first: newest first.
    assert [label.split("  ")[0] for label in labels] == ["Grimbol", "Grimbold Ironhand"]
    qtbot.keyClick(box, Qt.Key.Key_Down)
    qtbot.keyClick(box, Qt.Key.Key_Tab)
    assert not box.suggestions_visible()
    assert box.toPlainText() == "paid @Grimbold_Ironhand "
    # Lesson 9: typing straight after a pick lands at the caret, in order.
    qtbot.keyClicks(box, "back 20gp")
    assert box.toPlainText() == "paid @Grimbold_Ironhand back 20gp"
    assert [p.name for p in box.picks] == ["Grimbold Ironhand"]


def test_down_moves_the_highlight(box, qtbot):
    qtbot.keyClicks(box, "@a")
    first = box._suggestions.currentRow()
    qtbot.keyClick(box, Qt.Key.Key_Down)
    assert box._suggestions.currentRow() != first


def test_enter_saves_even_with_suggestions_open(window, box, qtbot):
    before = note_count(window)
    qtbot.keyClicks(box, "met @Grimb")
    assert box.suggestions_visible()
    qtbot.keyClick(box, Qt.Key.Key_Return)
    assert note_count(window) == before + 1
    assert box.toPlainText() == "" and not box.suggestions_visible()
    # Timed, but one sample is too noisy to gate on (a 108 ms spike was seen once under
    # full-suite load); test_perf.py gates the median, and G1 reads satchel.log.
    assert window.table.last_save_ms is not None


def test_saved_note_links_and_tags(window, box, qtbot):
    qtbot.keyClicks(box, "grimbold wants paying #debts")
    qtbot.keyClick(box, Qt.Key.Key_Return)
    text = window.store.conn.execute(
        "SELECT text FROM notes ORDER BY created_at DESC, rowid DESC LIMIT 1"
    ).fetchone()[0]
    assert text.startswith("@[grimbold](") and text.endswith("#debts")


def test_empty_box_does_not_save(window, box, qtbot):
    before = note_count(window)
    qtbot.keyClicks(box, "   ")
    qtbot.keyClick(box, Qt.Key.Key_Return)
    assert note_count(window) == before


def test_escape_closes_the_list_then_clears(box, qtbot):
    qtbot.keyClicks(box, "met @Grimb")
    qtbot.keyClick(box, Qt.Key.Key_Escape)
    assert not box.suggestions_visible() and box.toPlainText() == "met @Grimb"
    qtbot.keyClick(box, Qt.Key.Key_Escape)
    assert box.toPlainText() == ""


def test_hash_suggests_tags_by_use(box, qtbot):
    qtbot.keyClicks(box, "owes us #de")
    assert box.suggestion_labels()[0].startswith("#debts")
    qtbot.keyClick(box, Qt.Key.Key_Tab)
    assert box.toPlainText() == "owes us #debts "


def test_unknown_name_shows_a_hint_that_tab_ignores(box, qtbot):
    qtbot.keyClicks(box, "@Zzyzx")
    assert box.suggestion_labels() == ["New name: Zzyzx"]
    qtbot.keyClick(box, Qt.Key.Key_Tab)
    assert box.toPlainText() == "@Zzyzx"


def test_pasted_line_breaks_become_spaces(box):
    mime = QMimeData()
    mime.setText("line one\r\nline two\nthree")
    box.insertFromMimeData(mime)
    assert box.toPlainText() == "line one line two three"


def test_failed_save_keeps_the_text_and_says_why(window, box, qtbot, monkeypatch):
    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(window.store, "save_note", boom)
    qtbot.keyClicks(box, "don't lose me")
    qtbot.keyClick(box, Qt.Key.Key_Return)
    assert box.toPlainText() == "don't lose me"
    bar = window.table.message_bar
    assert bar.tone == "err" and "disk full" in bar.text.text()


def test_edit_a_note_in_the_box(window, box, qtbot):
    note_id = window.store.save_note("grimbold lent 20gp")
    window.table.begin_edit(note_id)
    assert box.toPlainText() == "grimbold lent 20gp"
    assert window.table.message_bar.tone == "warn"
    qtbot.keyClicks(box, " at 10%")
    qtbot.keyClick(box, Qt.Key.Key_Return)
    row = window.store.conn.execute(
        "SELECT text, original_text FROM notes WHERE id = ?", (note_id,)
    ).fetchone()
    assert row["text"].endswith("lent 20gp at 10%") and row["original_text"]
    assert box.editing_note_id is None and window.table.message_bar.tone == "none"


def test_escape_cancels_an_edit_without_saving(window, box, qtbot):
    note_id = window.store.save_note("unchanged")
    window.table.begin_edit(note_id)
    qtbot.keyClicks(box, " NOT")
    qtbot.keyClick(box, Qt.Key.Key_Escape)
    assert box.editing_note_id is None and box.toPlainText() == ""
    text = window.store.conn.execute("SELECT text FROM notes WHERE id = ?", (note_id,))
    assert text.fetchone()[0] == "unchanged"


def test_box_grows_to_four_lines_then_stops(box, qtbot):
    one_line = box.height()
    qtbot.keyClicks(box, "a long note " * 20)
    taller = box.height()
    assert taller > one_line
    qtbot.keyClicks(box, "and longer still " * 60)
    assert box.height() == taller or box.height() <= one_line * MAX_LINES


def test_names_are_highlighted_as_you_type(box, qtbot):
    qtbot.keyClicks(box, "met @Pip and grimbold")
    formats = box.document().firstBlock().layout().formats()
    chip = [f for f in formats if f.format.background().color() == QColor(COLOURS["highlight"])]
    underline = [f for f in formats if f.format.fontUnderline()]
    assert [(f.start, f.length) for f in chip] == [(4, 4)]
    assert [(f.start, f.length) for f in underline] == [(13, 8)]


def test_recall_follows_typed_names(window, box, qtbot):
    seen = []
    box.recall_changed.connect(seen.append)
    qtbot.keyClicks(box, "grimbold")
    grim = window.store.index.exact["grimbold ironhand"][0].id
    grimbol = window.store.index.exact["grimbol"][0].id
    # "grimbol" names the candidate on the way; "grimbold" is the short name.
    assert [grimbol] in seen
    assert seen[-1] == [grim]
