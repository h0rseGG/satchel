"""Heading fonts ship as TTF with their licence (SPEC 5.3). Loading them in Qt is a P1
check on Windows; here we check the files are real TrueType fonts with what we need."""

import string
from pathlib import Path

import pytest
from fontTools.ttLib import TTFont

FONTS = Path(__file__).parent.parent / "src" / "satchel" / "ui" / "fonts"


@pytest.mark.parametrize(
    ("file", "family"),
    [
        ("IMFellEnglish-Regular.ttf", "IM FELL English"),
        ("IMFellEnglishSC-Regular.ttf", "IM FELL English SC"),
    ],
)
def test_font_is_truetype_with_family_and_glyphs(file, family):
    font = TTFont(FONTS / file)
    assert font.sfntVersion == "\x00\x01\x00\x00", "plain TrueType, not woff/woff2"
    assert font["name"].getDebugName(1) == family
    cmap = font.getBestCmap()
    # Headings hold names: letters, common punctuation and the curly apostrophe.
    for ch in string.ascii_letters + "'’-.,!?":
        assert ord(ch) in cmap, repr(ch)


def test_licence_ships_with_the_fonts():
    assert "SIL Open Font License" in (FONTS / "OFL.txt").read_text()
