"""Plain file I/O outside the character database: local.json and kit zips (SPEC 2, 7).

Every function takes its folder or file path as an argument, so tests only ever use
tmp_path; `data_dir()` is the one place that knows about %LOCALAPPDATA%.
"""

import os
from pathlib import Path


def data_dir() -> Path:
    """%LOCALAPPDATA%\\Satchel, where live character files and local.json live."""
    return Path(os.environ["LOCALAPPDATA"]) / "Satchel"
