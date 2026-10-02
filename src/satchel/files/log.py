"""satchel.log: what happened, for G1 and for bugs (save times, opens, errors).

The windowed app has no console, so without this an error would vanish. Ids, times
and errors only: note text is never logged. Kept small: 1 MB, then up to 3 old files.
"""

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_NAME = "satchel.log"


def setup_logging(folder: Path, version: str) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / LOG_NAME
    handler = RotatingFileHandler(path, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log = logging.getLogger("satchel")
    log.setLevel(logging.INFO)
    log.addHandler(handler)
    log.info("Satchel %s started", version)

    def log_uncaught(kind, value, tb):
        # Qt keeps running after a Python error in a slot; record it rather than lose it.
        log.critical("uncaught error", exc_info=(kind, value, tb))
        sys.__excepthook__(kind, value, tb)

    sys.excepthook = log_uncaught
    return path
