"""Check Qt can load the heading fonts and find Segoe UI Variable (run on Windows).

PySide6 isn't a project dependency until P1, so borrow it for this one run:

    uv run --with pyside6 python tools/check_qt_fonts.py
"""

from pathlib import Path

from PySide6.QtGui import QFontDatabase, QGuiApplication

FONTS = Path(__file__).resolve().parent.parent / "src" / "satchel" / "ui" / "fonts"


def main() -> None:
    app = QGuiApplication([])  # Qt needs an application object before fonts load  # noqa: F841
    ok = True
    for name in ["IMFellEnglish-Regular.ttf", "IMFellEnglishSC-Regular.ttf"]:
        font_id = QFontDatabase.addApplicationFont(str(FONTS / name))
        families = QFontDatabase.applicationFontFamilies(font_id) if font_id >= 0 else []
        print(f"{name}: {families or 'FAILED TO LOAD'}")
        ok = ok and bool(families)
    segoe = [f for f in QFontDatabase.families() if "Segoe UI Variable" in f]
    print(f"Segoe UI Variable families: {segoe or 'NOT FOUND'}")
    print("ALL OK" if ok and segoe else "PROBLEM: paste this output to Claude")


if __name__ == "__main__":
    main()
