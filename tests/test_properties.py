"""Hypothesis fuzzing of the parser and resolver (SPEC 11).

Two kinds of input: fully random text (anything must parse without crashing), and text
built from name fragments and awkward punctuation, which actually hits the rules.
"""

import re

from hypothesis import given
from hypothesis import strategies as st

from satchel.core.autocomplete import active_token
from satchel.core.display import plain_text, segments
from satchel.core.matcher import find_names, resolve_note
from satchel.core.mentions import (
    build_name_index,
    find_stored,
    find_typed,
    mention_ids,
    strip_tokens,
    to_typed_form,
)
from satchel.core.tags import find_tags
from tests.helpers import TYPES_BY_ID, ent

PC = ent("Wren Ashdown", type_id="type-character")
ENTITIES = [
    PC,
    ent("Grimbold Ironhand"),
    ent("Mira Vane", aliases=["The Fox"]),
    ent("Lord Aldric"),
    ent("Aldric", type_id="type-other"),
    ent("Vane Street", type_id="type-location"),
    ent("O'Brien Tull"),
    ent("St. Cuthbert"),
    ent("Zoë"),
]
INDEX = build_name_index(ENTITIES, TYPES_BY_ID)

FRAGMENTS = [
    "grimbold", "Ironhand", "mira", "Vane", "street", "the fox", "lord", "aldric", "o'brien",
    "O’Brien", "tull", "st.", "cuthbert", "zoë", "wren", "pip", "Newbie",
    "@", "#", "_", "-", "'", "’", "'s", " ", "  ", "\n", ".", ",", "(", ")", "[", "]",
    "5", "x", "https://x.com/", "www.y.org/#", "bob@inn.com", "debts",
]  # fmt: skip
messy_text = st.lists(st.sampled_from(FRAGMENTS), max_size=25).map("".join)
any_text = st.text(max_size=200)
some_text = st.one_of(messy_text, any_text)


def resolve(text, index=INDEX, **kw):
    # Stable candidate ids per name, so two runs can be compared. Ids never contain
    # whitespace or ")" (real ones are UUIDs), so slug the name.
    return resolve_note(text, index, never_auto=[PC.id], new_candidate_id=candidate_id, **kw)


def candidate_id(name):
    return "cand-" + re.sub(r"\W+", "-", name.lower())


def assert_spans_ok(spans, length):
    last_end = 0
    for start, end in spans:
        assert 0 <= start < end <= length
        assert start >= last_end, "spans overlap or are out of order"
        last_end = end


@given(some_text)
def test_parsers_never_crash_and_spans_are_sane(text):
    assert_spans_ok([(t.start, t.end) for t in find_typed(text)], len(text))
    assert_spans_ok([(t.start, t.end) for t in find_tags(text)], len(text))
    assert_spans_ok([(t.start, t.end) for t in find_stored(text)], len(text))
    for h in find_names(text, INDEX):
        assert 0 <= h.start < h.end <= len(text)
        assert text[h.start : h.end] == h.text
    for caret in (0, len(text) // 2, len(text)):
        tok = active_token(text, caret)
        if tok:
            assert 0 <= tok.start < tok.end <= len(text)


@given(some_text)
def test_typed_tokens_start_with_a_letter_after_a_non_word_char(text):
    for t in find_typed(text):
        assert text[t.start] == "@"
        assert text[t.start + 1].isalpha()
        assert t.start == 0 or not (text[t.start - 1].isalnum() or text[t.start - 1] == "_")


@given(some_text)
def test_note_links_match_tokens(text):
    r = resolve(text)
    assert list(r.links) == mention_ids(r.text), "note_links invariant (SPEC 4.6.6)"
    assert PC.id not in {i for i, how in r.links.items() if how == "auto"}


@given(some_text)
def test_resolve_is_idempotent(text):
    first = resolve(text)
    index2 = INDEX.with_entities(first.candidates)
    second = resolve(first.text, index2, prior_how=first.links)
    assert second.text == first.text
    assert second.links == first.links
    assert second.candidates == ()


@given(some_text.filter(lambda t: "@" not in t))
def test_stripping_tokens_gives_back_what_was_typed(text):
    # No @ means no typed or stored tokens: everything linked is auto (SPEC 4.6.5).
    r = resolve(text)
    assert strip_tokens(r.text) == text
    assert r.candidates == ()


@given(some_text)
def test_edit_round_trip_keeps_links(text):
    first = resolve(text)
    index2 = INDEX.with_entities(first.candidates)
    form, picks = to_typed_form(first.text, index2, first.links)
    again = resolve(form, index2, picks=picks, prior_how=first.links)
    assert again.candidates == (), "editing never makes candidates"
    assert set(again.links) == set(first.links)


@given(some_text)
def test_display_never_crashes_and_covers_text(text):
    r = resolve(text)
    index2 = INDEX.with_entities(r.candidates)
    segs = segments(r.text, index2.by_id)
    assert all(s.text for s in segs)
    assert isinstance(plain_text(r.text, index2.by_id), str)
