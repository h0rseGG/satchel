"""P1 task 8: the recall panel on a copy of the demo."""

import shutil

import pytest
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QLabel

from satchel.ui.main_window import MainWindow


@pytest.fixture
def window(qtbot, tmp_path, demo_path):
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


def names(window):
    return [c.entity.name for c in window.table.recall.cards]


def eid(window, name):
    return window.store.index.exact[name.lower()][0].id


def test_typing_a_name_shows_its_card(window, qtbot):
    qtbot.keyClicks(window.table.capture, "paid grimbold back")
    assert names(window) == ["Grimbold Ironhand"]


def test_cards_most_recently_typed_first_max_three(window, qtbot):
    qtbot.keyClicks(window.table.capture, "bess told mira that aldric and grimbold met")
    assert names(window)[:1] == ["Grimbold Ironhand"]
    assert len(names(window)) == 3


def test_highlighted_suggestion_gets_the_first_card(window, qtbot):
    qtbot.keyClicks(window.table.capture, "grimbold met @Mir")
    assert names(window)[0] == "Mira Vane"


def test_player_character_never_gets_a_card(window, qtbot):
    qtbot.keyClicks(window.table.capture, "wren ashdown sighed")
    assert names(window) == []


def test_card_shows_relationships_and_dated_mentions(window, qtbot):
    qtbot.keyClicks(window.table.capture, "grimbold")
    card = window.table.recall.cards[0]
    lines = [lbl.text() for lbl in card.findChildren(QLabel)]
    assert any("Sept" in line for line in lines), lines
    assert any("rival: Lord Aldric" in line for line in lines), lines


def test_link_turns_the_plain_name_into_a_mention(window, qtbot):
    box = window.table.capture
    qtbot.keyClicks(box, "paid grimbold back")
    card = window.table.recall.cards[0]
    assert card.link_button is not None
    qtbot.mouseClick(card.link_button, Qt.MouseButton.LeftButton)
    assert box.toPlainText() == "paid @grimbold back"  # kept as typed (4.6.5)
    assert box.textCursor().position() == len(box.toPlainText()), "caret stays where it was"
    qtbot.keyClick(box, Qt.Key.Key_Return)
    text = window.store.conn.execute(
        "SELECT n.text FROM notes n ORDER BY n.created_at DESC LIMIT 1"
    ).fetchone()[0]
    links = window.store.conn.execute(
        "SELECT how FROM note_links l JOIN notes n ON n.id = l.note_id WHERE n.text = ?", (text,)
    ).fetchall()
    assert [r[0] for r in links] == ["typed"]


def test_no_link_button_once_it_is_already_a_mention(window, qtbot):
    qtbot.keyClicks(window.table.capture, "paid @Grimbold_Ironhand")
    assert window.table.recall.cards[0].link_button is None


def test_quick_type_accepts_a_new_name(window, qtbot):
    qtbot.keyClicks(window.table.capture, "vex was there")
    card = window.table.recall.cards[0]
    assert card.entity.name == "Vex" and card.type_button is not None
    npc = next(a for a in card.type_button.menu().actions() if a.text() == "NPC")
    npc.trigger()
    vex = window.store.index.by_id[eid(window, "Vex")]
    assert (vex.type_id, vex.is_candidate) == ("type-npc", False)
    assert window.table.recall.cards[0].type_button is None, "the card redraws as an NPC"


def test_short_text_also_searches(window, qtbot):
    qtbot.keyClicks(window.table.capture, "ledger")
    assert window.table.recall.search_lines, "the demo mentions a ledger"
    window.table.capture.clear()
    qtbot.keyClicks(window.table.capture, "one two three four five ledger")
    assert window.table.recall.search_lines == [], "more than 4 words: no search"
