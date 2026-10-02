"""local.json: machine-local state that is never packed (SPEC 2).

It holds conveniences, not data: if it's missing or unreadable we start from
defaults, and a broken file is kept aside as local.json.bad rather than lost.
Writes go to a temp file first and then replace the old one, so a crash mid-write
can't leave half a file.
"""

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

FILE_NAME = "local.json"
DEFAULT_HOTKEY = "Ctrl+Alt+N"


@dataclass
class LocalState:
    last_packed_at: dict[str, str] = field(default_factory=dict)  # character_id -> ISO UTC
    last_character: str | None = None  # file name of the character opened last
    window_geometry: str | None = None  # Qt saveGeometry() as base64
    hotkey: str = DEFAULT_HOTKEY


def load_state(folder: Path) -> LocalState:
    path = folder / FILE_NAME
    if not path.exists():
        return LocalState()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        state = LocalState(
            last_packed_at=dict(data.get("last_packed_at", {})),
            last_character=data.get("last_character"),
            window_geometry=data.get("window_geometry"),
            hotkey=data.get("hotkey") or DEFAULT_HOTKEY,
        )
        if not all(isinstance(v, str) for v in state.last_packed_at.values()):
            raise ValueError("last_packed_at values must be strings")
        return state
    except ValueError, TypeError, AttributeError:
        # Keep the broken file for a look later; start fresh rather than refuse to run.
        os.replace(path, folder / (FILE_NAME + ".bad"))
        return LocalState()


def save_state(folder: Path, state: LocalState) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    tmp = folder / (FILE_NAME + ".tmp")
    text = json.dumps(asdict(state), sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, folder / FILE_NAME)


def record_packed(folder: Path, character_id: str, exported_at: str) -> None:
    """Note a finished pack. Callers only call this after pack_kit has returned,
    i.e. after the kit was written and read back (lesson 7)."""
    state = load_state(folder)
    state.last_packed_at[character_id] = exported_at
    save_state(folder, state)
