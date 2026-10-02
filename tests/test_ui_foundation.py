"""P1 task 4: palette, stylesheet, fonts, strings, components, single instance.

Runs on the real Windows platform through pytest-qt's `qapp`/`qtbot` fixtures.
"""

import re
import sys
import uuid
from importlib import resources

import pytest
from PySide6.QtCore import QProcess
from PySide6.QtGui import QFontDatabase

from satchel.core.kit import ERROR_CODES
from satchel.ui import strings
from satchel.ui.components import BUTTON_KINDS, button, frame, page_title, panel_heading
from satchel.ui.main_window import MainWindow
from satchel.ui.palette import COLOURS
from satchel.ui.single_instance import SingleInstance
from satchel.ui.theme import apply_theme, load_fonts, stylesheet

# SPEC 5.3, copied by hand: the palette may not drift from the approved table.
SPEC_PALETTE = {
    "paper": "#F6F1E4",
    "paper-alt": "#EDE5D2",
    "rule": "#D8CDB6",
    "ink": "#3B3026",
    "ink-muted": "#736452",
    "red": "#9C4A3A",
    "green": "#4F6B47",
    "wash-ok": "#DCE5D3",
    "wash-warn": "#EED9AE",
    "wash-err": "#E9C9BF",
    "highlight": "#E2D3B0",
}


def raw_qss() -> str:
    return resources.files("satchel.ui").joinpath("satchel.qss").read_text(encoding="utf-8")


def test_palette_is_exactly_the_spec_table():
    assert COLOURS == SPEC_PALETTE


def test_stylesheet_never_writes_a_colour_itself():
    assert re.findall(r"#[0-9A-Fa-f]{3,8}\b", raw_qss()) == []
    assert not re.search(r"\b(rgb|rgba|hsl)\(", raw_qss())


def test_stylesheet_tokens_all_resolve_to_palette_colours():
    qss = stylesheet()
    assert "@" not in qss
    used = set(re.findall(r"#[0-9A-Fa-f]{6}\b", qss))
    assert used <= set(COLOURS.values())
    assert COLOURS["paper-alt"] in used, "@paper-alt isn't swallowed by @paper"


def test_unknown_token_is_an_error(monkeypatch):
    monkeypatch.setattr("satchel.ui.theme.COLOURS", {"paper": "#F6F1E4"})
    with pytest.raises(KeyError):
        stylesheet()


def test_heading_fonts_load_in_qt(qapp):
    families = load_fonts()
    assert "IM FELL English" in families and "IM FELL English SC" in families


def test_body_font_is_installed(qapp):
    assert "Segoe UI Variable Text" in QFontDatabase.families()


def test_every_kit_error_has_words():
    assert set(strings.KIT_ERRORS) == set(ERROR_CODES)


@pytest.mark.parametrize(("n", "text"), [(0, "0 notes"), (1, "1 note"), (2, "2 notes")])
def test_counts(n, text):
    assert strings.count(n, "note") == text


def test_entities_plural():
    assert strings.count(2, "entity", "entities") == "2 entities"


def test_components_set_the_properties_the_stylesheet_matches(qtbot):
    for kind in BUTTON_KINDS:
        b = button("x", kind)
        qtbot.addWidget(b)
        assert b.property("kind") == kind
        assert f'QPushButton[kind="{kind}"]' in raw_qss()
    with pytest.raises(ValueError):
        button("x", "fancy")
    for widget, role in [
        (page_title("t"), "page-title"),
        (panel_heading("h"), "panel-heading"),
        (frame("page"), "page"),
        (frame("panel"), "panel"),
    ]:
        qtbot.addWidget(widget)
        assert widget.property("role") == role
        assert f'[role="{role}"]' in raw_qss()


def test_main_window_shows_with_the_theme(qapp, qtbot):
    apply_theme(qapp)
    window = MainWindow()
    qtbot.addWidget(window)
    window.show()
    qtbot.waitExposed(window)
    assert window.windowTitle() == "Satchel"
    qapp.setStyleSheet("")


SECOND_COPY = """
import sys
from PySide6.QtCore import QCoreApplication
from satchel.ui.single_instance import SingleInstance
app = QCoreApplication([])
print("primary" if SingleInstance(sys.argv[1]).is_primary else "secondary")
"""


def test_second_copy_asks_the_first_to_show(qtbot):
    """A real second launch is another process, so the test starts one; the first copy
    keeps its event loop running meanwhile (QProcess, not a blocking subprocess)."""
    name = f"satchel-test-{uuid.uuid4().hex}"  # never the real app's name
    first = SingleInstance(name)
    assert first.is_primary
    proc = QProcess()
    with qtbot.waitSignal(first.show_requested, timeout=10000):
        proc.start(sys.executable, ["-c", SECOND_COPY, name])
    assert proc.waitForFinished(10000)
    assert bytes(proc.readAllStandardOutput().data()).strip() == b"secondary"
    first.close()
    third = SingleInstance(name)
    assert third.is_primary, "the name is free again once the first copy closes"
    third.close()
    for obj in (first, third, proc):
        obj.deleteLater()
    qtbot.wait(50)  # let the deleteLater calls run while Qt is still alive
