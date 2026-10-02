"""Pack kit, Unpack kit and the end-of-session nudge, as the user sees them (SPEC 7).

The work is done by satchel.files.kits (tested on its own); this module asks where,
shows the choices and says what happened. Every question to the user goes through a
small `ask_*` method, so tests can answer it without real dialogs.
"""

import tempfile
from pathlib import Path

from PySide6.QtCore import QDir
from PySide6.QtWidgets import QDialog, QFileDialog

from satchel import __version__
from satchel.core.kit import KitError, kit_filename
from satchel.core.when import date_label, local_day, time_label
from satchel.db.kit import changed_since
from satchel.files.kits import add_as_new, list_characters, open_kit, pack_kit, replace_with_kit
from satchel.files.local_state import save_state
from satchel.ui import strings
from satchel.ui.dialogs import choice_dialog, confirm_destructive


class KitActions:
    def __init__(self, window):
        self.window = window  # MainWindow: store, state, data_dir, clock, messages()

    # --- Questions (tests replace these) ----------------------------------------------

    def ask_save_path(self, suggested: Path) -> Path | None:
        path, _ = QFileDialog.getSaveFileName(
            self.window, strings.PACK_TITLE, str(suggested), strings.KIT_FILTER
        )
        return Path(path) if path else None

    def ask_open_path(self) -> Path | None:
        path, _ = QFileDialog.getOpenFileName(
            self.window, strings.UNPACK_TITLE, self._kit_folder(), strings.KIT_FILTER
        )
        return Path(path) if path else None

    def ask_unpack_choice(self, body: str, can_replace: bool) -> str | None:
        choices = [("new", strings.ADD_AS_NEW, "primary")]
        if can_replace:
            choices.append(("replace", strings.REPLACE, "danger"))
        dialog = choice_dialog(self.window, strings.UNPACK_TITLE, body, choices)
        return dialog.chosen if dialog.exec() == QDialog.DialogCode.Accepted else None

    def ask_confirm_replace(self, name: str, newer_here: bool) -> bool:
        body = strings.REPLACE_BODY.format(name=name)
        if newer_here:
            body += "\n\n" + strings.REPLACE_NEWER_WARNING
        title = strings.REPLACE_TITLE.format(name=name)
        return confirm_destructive(self.window, title, body, strings.REPLACE)

    # --- Pack --------------------------------------------------------------------------

    def pack(self) -> Path | None:
        w = self.window
        store = w.store
        if store is None:
            return None
        local_now = w.clock().astimezone()
        suggested = Path(self._kit_folder()) / kit_filename(store.character_name, local_now)
        dest = self.ask_save_path(suggested)
        if dest is None:
            return None
        exported_at = store.now()
        try:
            pack_kit(store.conn, dest, exported_at=exported_at, app_version=__version__)
        except (KitError, OSError) as e:
            w.messages().show_message(strings.PACK_FAILED.format(error=e), "err")
            return None
        # Recorded only now, after pack_kit wrote the kit and read it back (lesson 7).
        w.state.last_packed_at[store.character_id] = exported_at
        w.state.last_kit_folder = str(dest.parent)
        save_state(w.data_dir, w.state)
        w.messages().show_message(strings.KIT_PACKED.format(file_name=dest.name), "ok")
        return dest

    # --- Unpack ------------------------------------------------------------------------

    def unpack(self) -> Path | None:
        w = self.window
        kit = self.ask_open_path()
        if kit is None:
            return None
        w.state.last_kit_folder = str(kit.parent)
        save_state(w.data_dir, w.state)
        with tempfile.TemporaryDirectory(prefix="satchel-unpack-") as tmp:
            try:
                unpacked = open_kit(kit, Path(tmp))
            except KitError as e:
                w.messages().show_message(strings.KIT_ERRORS[e.code], "err")
                return None
            m = unpacked.manifest
            local = next(
                (
                    i
                    for i in (list_characters(w.data_dir) if w.data_dir.exists() else [])
                    if i.character_id == m.character_id
                ),
                None,
            )
            when = f"{date_label(local_day(m.exported_at))} {time_label(m.exported_at)}"
            body_text = strings.UNPACK_BODY_HERE if local else strings.UNPACK_BODY
            choice = self.ask_unpack_choice(
                body_text.format(name=m.character_name, when=when), local is not None
            )
            try:
                if choice == "new":
                    path = add_as_new(unpacked, w.data_dir)
                    w.open_character(path)
                    w.messages().show_message(
                        strings.UNPACKED_NEW.format(name=m.character_name), "ok"
                    )
                    return path
                if choice == "replace" and local is not None:
                    return self._replace(unpacked, local.path)
            except (KitError, OSError) as e:
                w.messages().show_message(strings.UNPACK_FAILED.format(error=e), "err")
            return None

    def _replace(self, unpacked, local_path: Path) -> Path | None:
        w = self.window
        m = unpacked.manifest
        # Has this computer's copy changed since the kit was packed? (Read-only check;
        # WAL lets it see every committed save even while the file is open.)
        newer_here = changed_since(local_path, m.exported_at)
        if not self.ask_confirm_replace(m.character_name, newer_here):
            return None
        reopen = w.store is not None and w.store.path == local_path
        if reopen:
            w.close_character()  # the file can't be swapped while it's open
        parked = replace_with_kit(
            unpacked, local_path, w.data_dir, local_time=w.clock().astimezone()
        )
        w.open_character(local_path)
        w.messages().show_message(strings.UNPACKED_REPLACED.format(file_name=parked.name), "ok")
        return parked

    # --- Nudge (SPEC 7.3) ------------------------------------------------------------------

    def nudge_if_unpacked(self) -> bool:
        """After End session: if anything changed since the last pack, a non-blocking
        bar offers Pack kit / Not now. Never a dialog, never a badge."""
        w = self.window
        store = w.store
        if store is None:
            return False
        latest = store.latest_change_at()
        packed = w.state.last_packed_at.get(store.character_id)
        if latest is None or (packed is not None and latest <= packed):
            return False
        w.messages().show_message(
            strings.END_OF_SESSION_NUDGE,
            "warn",
            [(strings.PACK_KIT, "primary", self.pack), (strings.NOT_NOW, "quiet", lambda: None)],
        )
        return True

    def _kit_folder(self) -> str:
        folder = self.window.state.last_kit_folder
        return folder if folder and Path(folder).is_dir() else QDir.homePath()
