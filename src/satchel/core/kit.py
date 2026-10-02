"""Kit rules that need no files: names, the manifest and its checks (SPEC 7).

The zip and file moves live in satchel.files.kits; this module only decides what
things are called and whether a manifest is acceptable.
"""

import json
import re
import unicodedata
from dataclasses import asdict, dataclass
from datetime import datetime

KIT_FORMAT = "satchel"
MANIFEST_NAME = "manifest.json"
DATABASE_NAME = "character.satchel"

ERROR_CODES = (
    "not_zip",
    "no_manifest",
    "bad_manifest",
    "not_satchel",
    "no_database",
    "corrupt",
    "too_new",
    "mismatch",
    "not_same_character",
)


class KitError(Exception):
    """A kit (or a file in one) can't be used. `code` (one of ERROR_CODES) says why;
    the UI turns it into words (strings.py), so messages stay in one place."""

    def __init__(self, code: str, detail: str = ""):
        if code not in ERROR_CODES:
            raise ValueError(f"unknown kit error code: {code}")
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code


@dataclass(frozen=True)
class Manifest:
    format: str
    schema_version: int
    character_id: str
    character_name: str
    exported_at: str  # ISO 8601 UTC, as stored times
    app_version: str


def slugify(name: str) -> str:
    """ASCII file-name slug: "Wren Ashdown" -> "wren-ashdown", "Ælfrēd" -> "aelfred".
    Accents are dropped via Unicode decomposition; anything left that isn't a letter
    or digit becomes a dash. Never empty."""
    folded = unicodedata.normalize("NFKD", name.replace("æ", "ae").replace("Æ", "Ae"))
    ascii_only = folded.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only).strip("-")
    return slug or "character"


def kit_filename(character_name: str, local_time: datetime) -> str:
    """<slug>-YYYY-MM-DD-HHmm.kit, in local time (SPEC 7.1)."""
    return f"{slugify(character_name)}-{local_time:%Y-%m-%d-%H%M}.kit"


def replaced_filename(character_name: str, local_time: datetime) -> str:
    """Where Replace parks the old file: replaced/<slug>-<timestamp>.satchel (SPEC 7.2).
    Seconds are included so two Replaces in one minute don't collide."""
    return f"{slugify(character_name)}-{local_time:%Y-%m-%d-%H%M%S}.satchel"


def manifest_json(m: Manifest) -> str:
    """Canonical JSON: sorted keys, fixed indent, trailing newline, so the same
    manifest is always the same bytes (lesson 11)."""
    return json.dumps(asdict(m), sort_keys=True, indent=2, ensure_ascii=False) + "\n"


_FIELDS = {
    "format": str,
    "schema_version": int,
    "character_id": str,
    "character_name": str,
    "exported_at": str,
    "app_version": str,
}


def parse_manifest(text: str) -> Manifest:
    """Read a manifest, refusing anything that isn't a Satchel kit's (SPEC 7.2)."""
    try:
        data = json.loads(text)
    except ValueError as e:  # includes JSONDecodeError and bad UTF-8 surrogates
        raise KitError("bad_manifest", "not JSON") from e
    if not isinstance(data, dict):
        raise KitError("bad_manifest", "not an object")
    if data.get("format") != KIT_FORMAT:
        raise KitError("not_satchel", repr(data.get("format")))
    for name, kind in _FIELDS.items():
        value = data.get(name)
        # bool is a subclass of int in Python; a schema_version of true isn't a number.
        if not isinstance(value, kind) or isinstance(value, bool):
            raise KitError("bad_manifest", f"{name} missing or not {kind.__name__}")
    if not data["character_id"]:
        raise KitError("bad_manifest", "empty character_id")
    return Manifest(**{name: data[name] for name in _FIELDS})
