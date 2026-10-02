"""Load the look: heading fonts and the stylesheet (SPEC 5.3)."""

import re
from importlib import resources

from PySide6.QtGui import QFontDatabase
from PySide6.QtWidgets import QApplication

from satchel.ui.palette import COLOURS, FONT_FILES

# @name, where name is lower-case words joined by dashes (e.g. @paper-alt). Matching
# the whole name at once means @paper never eats the start of @paper-alt.
_TOKEN = re.compile(r"@([a-z]+(?:-[a-z]+)*)")


def stylesheet() -> str:
    """satchel.qss with every @colour replaced by its hex value from the palette.
    An unknown @name is a bug in the stylesheet, so it raises rather than guess."""
    qss = resources.files("satchel.ui").joinpath("satchel.qss").read_text(encoding="utf-8")

    def colour(m: re.Match[str]) -> str:
        name = m.group(1)
        if name not in COLOURS:
            raise KeyError(f"satchel.qss uses @{name}, which isn't in palette.COLOURS")
        return COLOURS[name]

    return _TOKEN.sub(colour, qss)


def load_fonts() -> list[str]:
    """Register the bundled heading fonts with Qt. Returns the family names loaded;
    a font that fails to load falls back to Georgia via the stylesheet."""
    families = []
    fonts = resources.files("satchel.ui").joinpath("fonts")
    for name in FONT_FILES:
        data = fonts.joinpath(name).read_bytes()
        font_id = QFontDatabase.addApplicationFontFromData(data)
        if font_id >= 0:
            families += QFontDatabase.applicationFontFamilies(font_id)
    return families


def apply_theme(app: QApplication) -> None:
    load_fonts()
    app.setStyle("Fusion")  # a neutral base, so the stylesheet looks the same everywhere
    app.setStyleSheet(stylesheet())
