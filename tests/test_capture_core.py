"""core/capture.py: what the capture box colours, recalls and inserts (pure)."""

from satchel.core.autocomplete import active_token
from satchel.core.capture import (
    AUTO,
    STORED,
    TAG,
    TYPED,
    apply_tag_pick,
    highlight_spans,
    recall_ids,
)
from satchel.core.mentions import build_name_index
from tests.helpers import TYPES_BY_ID, ent

GRIM = ent("Grimbold Ironhand")
BESS = ent("Old Bess")
WREN = ent("Wren Ashdown", type_id="type-character")
MILL = ent("The Mill", type_id="type-location")
INDEX = build_name_index([GRIM, BESS, WREN, MILL], TYPES_BY_ID)


def kinds(text, **kw):
    return [(text[s.start : s.end], s.kind) for s in highlight_spans(text, INDEX, **kw)]


def test_typed_auto_and_tag_spans_in_order():
    assert kinds("met grimbold at the mill #debts @Pip") == [
        ("grimbold", AUTO),
        ("the mill", AUTO),
        ("#debts", TAG),
        ("@Pip", TYPED),
    ]


def test_player_character_is_not_shown_as_an_auto_link():
    assert kinds("wren ashdown sighed", never_auto=[WREN.id]) == []
    assert kinds("@Wren_Ashdown sighed", never_auto=[WREN.id]) == [("@Wren_Ashdown", TYPED)]


def test_stored_tokens_in_edit_form_are_chips():
    text = f"@[St. Cuthbert]({GRIM.id}) says hi"
    assert kinds(text) == [(f"@[St. Cuthbert]({GRIM.id})", STORED)]


def test_names_inside_tokens_and_urls_are_not_auto():
    assert kinds("@Grimbold_Ironhand at https://x.com/grimbold") == [("@Grimbold_Ironhand", TYPED)]


def test_recall_puts_the_highlighted_suggestion_first():
    text = "bess and grimbold"
    assert recall_ids(text, INDEX) == [GRIM.id, BESS.id], "most recently typed first"
    assert recall_ids(text, INDEX, highlighted_id=BESS.id) == [BESS.id, GRIM.id]


def test_recall_never_shows_the_player_character_and_caps_at_three():
    text = "wren ashdown, bess, grimbold, the mill"
    assert WREN.id not in recall_ids(text, INDEX, exclude=[WREN.id])
    assert len(recall_ids(text, INDEX, highlighted_id=MILL.id)) == 3
    assert recall_ids("", INDEX, highlighted_id=WREN.id, exclude=[WREN.id]) == []


def test_tag_pick_writes_underscores_and_a_space():
    text = "owes him #do_n"
    token = active_token(text, len(text))
    assert apply_tag_pick(text, token, "do not trust") == ("owes him #do_not_trust ", 23)
