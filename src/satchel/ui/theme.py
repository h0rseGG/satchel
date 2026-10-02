"""Load the look: heading fonts and the stylesheet (SPEC 5.3)."""

import re
from importlib import resources

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QFontDatabase, QPalette
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


def light_palette() -> QPalette:
    """Qt's own colours for anything the stylesheet doesn't reach, from the SPEC
    palette only. Without this, Windows dark mode leaks in (seen: a black feed)."""
    c = {name: QColor(value) for name, value in COLOURS.items()}
    p = QPalette()
    roles = QPalette.ColorRole
    for role, name in [
        (roles.Window, "paper"),
        (roles.Base, "paper"),
        (roles.AlternateBase, "paper-alt"),
        (roles.Button, "paper-alt"),
        (roles.ToolTipBase, "paper-alt"),
        (roles.WindowText, "ink"),
        (roles.Text, "ink"),
        (roles.ButtonText, "ink"),
        (roles.ToolTipText, "ink"),
        (roles.HighlightedText, "ink"),
        (roles.Highlight, "highlight"),
        (roles.PlaceholderText, "ink-muted"),
        (roles.Mid, "rule"),
        (roles.Light, "paper"),
        (roles.Dark, "rule"),
    ]:
        p.setColor(role, c[name])
    return p


def apply_theme(app: QApplication) -> None:
    load_fonts()
    # SPEC 5.3: no dark mode. Ask Qt for the light scheme whatever Windows is set to.
    app.styleHints().setColorScheme(Qt.ColorScheme.Light)
    app.setStyle("Fusion")  # a neutral base, so the stylesheet looks the same everywhere
    app.setPalette(light_palette())
    app.setStyleSheet(stylesheet())
