"""satchel.log (P1 task 12): save times for G1, errors, and never note text."""

import logging
import sys

import pytest

from satchel.files.log import LOG_NAME, setup_logging
from satchel.ui.store import CharacterStore, create_character_file


@pytest.fixture
def store(tmp_path, qapp):
    s = CharacterStore(create_character_file(tmp_path, "Wren Ashdown"))
    yield s
    s.close()


def test_saves_are_logged_with_time_but_never_text(store, caplog):
    caplog.set_level(logging.INFO, logger="satchel")
    note_id = store.save_note("the secret is in the barrow")
    [record] = [r for r in caplog.records if r.getMessage().startswith("save ")]
    assert note_id in record.getMessage() and record.getMessage().endswith(" ms")
    assert "barrow" not in caplog.text
    assert store.last_save_ms is not None and store.last_save_ms < 50


def test_a_failed_save_is_logged_and_raised(store, caplog, monkeypatch):
    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr("satchel.ui.store.db_notes.save_note", boom)
    with pytest.raises(OSError):
        store.save_note("x")
    assert "save failed" in caplog.text and "disk full" in caplog.text


def test_setup_writes_the_log_file(tmp_path):
    log = logging.getLogger("satchel")
    before_handlers, before_hook = list(log.handlers), sys.excepthook
    try:
        path = setup_logging(tmp_path, "3.0.0.test")
        for h in log.handlers:
            h.flush()
        assert path == tmp_path / LOG_NAME
        assert "Satchel 3.0.0.test started" in path.read_text(encoding="utf-8")
    finally:
        for h in log.handlers:
            if h not in before_handlers:
                log.removeHandler(h)
                h.close()
        sys.excepthook = before_hook
