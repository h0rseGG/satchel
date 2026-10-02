"""CharacterStore: the UI's only door to a character file. Files under tmp_path only."""

from datetime import UTC, datetime, timedelta

import pytest

from satchel.ui.store import CharacterStore, create_character_file


class TickingClock:
    """A clock that moves one minute per reading, so every write gets its own time."""

    def __init__(self, start=datetime(2026, 9, 5, 11, 0, tzinfo=UTC)):
        self.t = start

    def __call__(self) -> datetime:
        self.t += timedelta(minutes=1)
        return self.t


@pytest.fixture
def store(tmp_path, qapp):
    clock = TickingClock()
    path = create_character_file(tmp_path, "Wren Ashdown", clock)
    s = CharacterStore(path, clock)
    yield s
    s.close()


def test_create_character_file_names_and_identity(tmp_path, qapp):
    first = create_character_file(tmp_path, "Wren Ashdown")
    second = create_character_file(tmp_path, "Wren Ashdown")
    assert (first.name, second.name) == ("wren-ashdown.satchel", "wren-ashdown-2.satchel")
    a, b = CharacterStore(first), CharacterStore(second)
    assert a.character_name == "Wren Ashdown"
    assert a.character_id and a.character_id != b.character_id
    a.close()
    b.close()


def test_start_and_end_session_signal(store, qtbot):
    with qtbot.waitSignals([store.session_changed, store.notes_changed]):
        session = store.start_session()
    assert session.number == 1 and session.date == "2026-09-05"
    assert store.current_session() == session
    with qtbot.waitSignal(store.session_changed):
        store.end_session()
    assert store.current_session() is None


def test_session_title_signals_only_on_change(store, qtbot):
    session = store.start_session()
    with qtbot.waitSignal(store.session_changed):
        store.set_session_title(session.id, "The mill")
    with qtbot.assertNotEmitted(store.session_changed):
        store.set_session_title(session.id, "The mill")


def test_save_note_goes_into_the_current_session(store):
    session = store.start_session()
    note_id = store.save_note("met @Grimbold #debts")
    [row] = store.feed_notes()
    assert (row.id, row.session_id) == (note_id, session.id)


def test_new_candidate_refreshes_index_and_tags(store, qtbot):
    with qtbot.waitSignals([store.notes_changed, store.entities_changed]):
        store.save_note("met @Grimbold #debts")
    assert any(e.name == "Grimbold" for e in store.index.by_id.values())
    assert store.tag_counts == {"debts": 1}
    with qtbot.assertNotEmitted(store.entities_changed):
        store.save_note("grimbold again")  # links the existing candidate, makes nothing


def test_feed_between_sessions_starts_at_the_last_session(store):
    store.save_note("before any session")
    store.start_session()
    store.save_note("in session one")
    store.end_session()
    after = store.save_note("after session one")
    assert [r.id for r in store.feed_notes()] == [after]


def test_feed_with_no_sessions_shows_every_note(store):
    a = store.save_note("one")
    b = store.save_note("two")
    assert [r.id for r in store.feed_notes()] == [a, b]


def test_edit_note_round_trip(store, qtbot):
    note_id = store.save_note("met @Grimbold")
    text, picks = store.edit_form(note_id)
    assert text == "met @Grimbold"
    with qtbot.waitSignal(store.notes_changed):
        store.edit_note(note_id, text + " at the mill", picks)
    [row] = store.feed_notes()
    assert row.text.endswith(" at the mill")
