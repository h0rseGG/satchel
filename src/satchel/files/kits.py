"""Pack kit and Unpack kit (SPEC 7): the zip, and moving character files about.

Order of safety:
- Pack builds the kit under a temporary name, reads it back with the same checks
  Unpack uses, and only then gives it its real name. "Packed" is recorded by the
  caller after this returns (lesson 7: wait for the state, not the event).
- Unpack checks everything in a work folder before touching any live file.
- Replace parks the old file in replaced/ before the new one goes in, and puts it
  back if the swap fails.
"""

import os
import shutil
import tempfile
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from satchel.core.kit import (
    DATABASE_NAME,
    KIT_FORMAT,
    MANIFEST_NAME,
    KitError,
    Manifest,
    manifest_json,
    parse_manifest,
    replaced_filename,
    slugify,
)
from satchel.core.model import new_id
from satchel.db.entities import get_meta
from satchel.db.kit import (
    FileIdentity,
    integrity_ok,
    is_newer_than_app,
    read_identity,
    set_character_id,
    upgrade_file,
    vacuum_into,
)
from satchel.db.migrate import latest_version, user_version

# SQLite's side files for a database in WAL mode.
SIDE_SUFFIXES = ("-wal", "-shm")


@dataclass(frozen=True)
class UnpackedKit:
    manifest: Manifest
    db_path: Path  # a checked copy, migrated to this app's schema, in the work folder


# --- Pack ----------------------------------------------------------------------------


def pack_kit(conn, dest: Path, *, exported_at: str, app_version: str) -> Manifest:
    """Write one character to a .kit at `dest`. Returns its manifest once the kit has
    been read back and checked."""
    manifest = Manifest(
        format=KIT_FORMAT,
        schema_version=user_version(conn),
        character_id=get_meta(conn, "character_id") or "",
        character_name=get_meta(conn, "character_name") or "",
        exported_at=exported_at,
        app_version=app_version,
    )
    # The temp folder sits next to the destination so the final rename stays on one
    # drive (os.replace can't move across drives).
    with tempfile.TemporaryDirectory(dir=dest.parent, prefix=".satchel-pack-") as tmp:
        work = Path(tmp)
        db_copy = work / DATABASE_NAME
        vacuum_into(conn, db_copy)
        partial = work / (dest.name + ".partial")
        with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(MANIFEST_NAME, manifest_json(manifest))
            zf.write(db_copy, DATABASE_NAME)
        check = open_kit(partial, work / "check")
        if check.manifest != manifest:
            raise KitError("corrupt", "kit read back differently")
        os.replace(partial, dest)
    return manifest


# --- Unpack: check ---------------------------------------------------------------------


def open_kit(kit_path: Path, work_dir: Path) -> UnpackedKit:
    """Check a kit and extract its database into `work_dir` (SPEC 7.2). Raises
    KitError with a code; nothing outside work_dir is touched."""
    if not zipfile.is_zipfile(kit_path):
        raise KitError("not_zip")
    work_dir.mkdir(parents=True, exist_ok=True)
    db_path = work_dir / DATABASE_NAME
    try:
        with zipfile.ZipFile(kit_path) as zf:
            names = set(zf.namelist())
            if MANIFEST_NAME not in names:
                raise KitError("no_manifest")
            try:
                text = zf.read(MANIFEST_NAME).decode("utf-8")
            except UnicodeDecodeError as e:
                raise KitError("bad_manifest", "not UTF-8") from e
            manifest = parse_manifest(text)
            if DATABASE_NAME not in names:
                raise KitError("no_database")
            # Extract by our fixed name only: a hostile member path can't escape.
            with zf.open(DATABASE_NAME) as src, db_path.open("wb") as out:
                shutil.copyfileobj(src, out)
    except zipfile.BadZipFile as e:  # also raised for a CRC error while reading
        raise KitError("corrupt", str(e)) from e

    identity = read_identity(db_path)
    if is_newer_than_app(identity):
        raise KitError("too_new", f"schema {identity.schema_version} > {latest_version()}")
    if not integrity_ok(db_path):
        raise KitError("corrupt", "integrity_check failed")
    if identity.character_id != manifest.character_id:
        raise KitError("mismatch", "manifest and database disagree on character_id")
    if identity.schema_version < latest_version():
        upgrade_file(db_path)
    return UnpackedKit(manifest, db_path)


# --- Unpack: the two choices -----------------------------------------------------------


def list_characters(folder: Path) -> list[FileIdentity]:
    """Character files in the data folder (File › Open character), by name. Files that
    can't be read are left out rather than stopping the list."""
    found = []
    for path in sorted(folder.glob("*.satchel")):
        try:
            found.append(read_identity(path))
        except KitError:
            continue
    return sorted(found, key=lambda i: ((i.character_name or "").lower(), i.path.name))


def free_path(folder: Path, stem: str) -> Path:
    """folder/stem.satchel, or stem-2, stem-3 ... if taken."""
    path = folder / f"{stem}.satchel"
    n = 2
    while path.exists():
        path = folder / f"{stem}-{n}.satchel"
        n += 1
    return path


def _copy_in(src: Path, dest: Path) -> None:
    """Copy under a temporary name, then rename: a half-copied file never has a real
    .satchel name."""
    partial = dest.with_name(dest.name + ".partial")
    shutil.copyfile(src, partial)
    os.replace(partial, dest)


def add_as_new(unpacked: UnpackedKit, folder: Path, *, make_id: Callable[[], str] = new_id) -> Path:
    """Add the kit's character as a new file (SPEC 7.2). If this character is already
    here, the copy gets a new character_id so the two never get confused."""
    folder.mkdir(parents=True, exist_ok=True)
    here = {i.character_id for i in list_characters(folder)}
    if unpacked.manifest.character_id in here:
        set_character_id(unpacked.db_path, make_id())
    dest = free_path(folder, slugify(unpacked.manifest.character_name))
    _copy_in(unpacked.db_path, dest)
    return dest


def replace_with_kit(
    unpacked: UnpackedKit, local_path: Path, folder: Path, *, local_time: datetime
) -> Path:
    """Swap the kit in for the same character's local file (SPEC 7.2). The caller must
    have confirmed with Jake and closed its connection to `local_path`. Returns where
    the old file was parked (replaced/...)."""
    local = read_identity(local_path)
    if local.character_id != unpacked.manifest.character_id:
        raise KitError("not_same_character")
    replaced_dir = folder / "replaced"
    replaced_dir.mkdir(parents=True, exist_ok=True)
    name = local.character_name or unpacked.manifest.character_name
    parked = replaced_dir / replaced_filename(name, local_time)

    incoming = local_path.with_name(local_path.name + ".incoming")
    shutil.copyfile(unpacked.db_path, incoming)
    _move_with_side_files(local_path, parked)
    try:
        os.replace(incoming, local_path)
    except OSError:
        _move_with_side_files(parked, local_path)  # put the old file back
        raise
    return parked


def _move_with_side_files(src: Path, dest: Path) -> None:
    """Move a database with any -wal/-shm left from an unclean close, so the moved
    copy stays whole."""
    os.replace(src, dest)
    for suffix in SIDE_SUFFIXES:
        side = src.with_name(src.name + suffix)
        if side.exists():
            os.replace(side, dest.with_name(dest.name + suffix))
