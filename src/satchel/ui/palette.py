"""The "field journal" look in numbers (SPEC 5.3). The only place colours are defined.

satchel.qss refers to these as @name (QSS has no variables of its own); theme.py
swaps them in when the stylesheet loads, and a test fails if the stylesheet uses a
colour that isn't here.
"""

COLOURS = {
    "paper": "#F6F1E4",  # window background
    "paper-alt": "#EDE5D2",  # panels, cards, toolbars
    "rule": "#D8CDB6",  # borders, ruled lines, dividers
    "ink": "#3B3026",  # body text, primary buttons
    "ink-muted": "#736452",  # secondary text, timestamps, hints (never on washes)
    "red": "#9C4A3A",  # margin line, danger, focus ring
    "green": "#4F6B47",  # "done/packed" marks
    "wash-ok": "#DCE5D3",  # success background
    "wash-warn": "#EED9AE",  # warning background
    "wash-err": "#E9C9BF",  # error background
    "highlight": "#E2D3B0",  # link chips, selected rows
}

# Spacing steps in px (SPEC 5.3: 4/8/12/16/24).
SPACE = {"xs": 4, "s": 8, "m": 12, "l": 16, "xl": 24}

# Type scale in px (12/13/14/16/20/26). Body text is 14; headings 20 (panels) and 26 (pages).
SIZE = {"caption": 12, "small": 13, "body": 14, "large": 16, "panel": 20, "page": 26}

RADIUS = 3

# Qt family names, verified on the laptop 2026-10-02 (SPEC 5.3).
FONT_BODY = "Segoe UI Variable Text"
FONT_SMALL = "Segoe UI Variable Small"
FONT_HEADING = "IM FELL English"
FONT_HEADING_SC = "IM FELL English SC"
FONT_FILES = ("IMFellEnglish-Regular.ttf", "IMFellEnglishSC-Regular.ttf")
