"""Convert the v2 heading fonts (woff2) to TTF for Qt (SPEC 5.3, decision 2026-10-02).

Qt's woff2 support on Windows is unverified, so we ship plain TTF. The source woff2 files
live in git at tag v2-final; this reads them from there, so the conversion can be
repeated exactly. Needs fontTools with brotli (the dev group's fonttools[woff]).

    uv run python tools/convert_fonts.py
"""

import io
import subprocess
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "satchel" / "ui" / "fonts"
FONTS = {
    "im-fell-english.woff2": "IMFellEnglish-Regular.ttf",
    "im-fell-english-sc.woff2": "IMFellEnglishSC-Regular.ttf",
}


def from_tag(path: str) -> bytes:
    return subprocess.run(
        ["git", "show", f"v2-final:{path}"], cwd=ROOT, check=True, capture_output=True
    ).stdout


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for src, dst in FONTS.items():
        font = TTFont(io.BytesIO(from_tag(f"vendor/fonts/{src}")))
        font.flavor = None  # plain sfnt (TTF) instead of woff2; glyph data unchanged
        font.save(OUT / dst)
        print(f"{src} -> {dst} ({(OUT / dst).stat().st_size} bytes)")
    (OUT / "OFL.txt").write_bytes(from_tag("vendor/fonts/OFL.txt"))
    print("OFL.txt copied")


if __name__ == "__main__":
    main()
