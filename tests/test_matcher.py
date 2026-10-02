"""SPEC 4.5 recall (v2 mentions.test.js cases) and 4.6 auto-link (v3)."""

from satchel.core.matcher import (
    auto_link,
    find_names,
    link_occurrence,
    link_target,
    named_entities,
    resolve_note,
)
from satchel.core.mentions import Pick, build_name_index, mention_ids, resolve_typed, strip_tokens
from tests.helpers import TYPES_BY_ID, ent


def index(*entities):
    return build_name_index(entities, TYPES_BY_ID)


# --- 4.5 recall (v2) ---


def test_names_in_plain_text_not_inside_tokens_tags_or_urls():
    g = ent("Grimbold Ironhand")
    m = ent("Mira Vane", aliases=["the fox"])
    text = "grimbold said The Fox was here, not @Mira or #grimbold or https://x.com/vane"
    assert sorted(h.text for h in find_names(text, index(g, m))) == ["The Fox", "grimbold"]


def test_recall_most_recently_typed_first_max_3_never_the_player_character():
    pc = ent("Wren Ashdown", type_id="type-character")
    es = [ent(n) for n in ("Aldric", "Bess", "Caldra", "Dorn")]
    idx = index(pc, *es)
    got = named_entities("aldric bess wren caldra dorn aldric", idx, exclude=[pc.id])
    assert [e.name for e in got] == ["Aldric", "Dorn", "Caldra"]


def test_tap_to_link_lord_aldric_beats_short_name_inside_it():
    ald = ent("Lord Aldric")
    idx = index(ald, ent("Lord Byron"))
    text = "aldric lied, then lord aldric left"
    hit = link_target(text, ald.id, idx)
    assert hit.text == "lord aldric"
    new_text, caret, pick = link_occurrence(text, hit, ald)
    assert new_text == "aldric lied, then @lord_aldric left"
    assert caret == len("aldric lied, then @lord_aldric")
    assert mention_ids(resolve_typed(new_text, idx, picks=[pick]).text) == [ald.id]


def test_match_inside_a_longer_match_is_dropped():
    idx = index(ent("Aldric", type_id="type-other"), ent("Lord Aldric"))
    assert [e.name for e in named_entities("then lord aldric left", idx)] == ["Lord Aldric"]


def test_apostrophes_match_either_way_in_plain_text():
    idx = index(ent("O'Brien Tull"))
    assert len(find_names("saw O’Brien Tull", idx)) == 1


def test_whitespace_runs_match_a_single_space():
    idx = index(ent("Lord Aldric"))
    assert find_names("lord\n  aldric", idx)[0].text == "lord\n  aldric"


def test_word_boundary_required():
    idx = index(ent("Bess"))
    assert find_names("Bessie and bess", idx)[0].start == 11


def test_tap_to_link_falls_back_to_stored_token():
    st = ent("St. Cuthbert", aliases=["Cuthbert's"])
    hit = find_names("pray to cuthbert's shrine", index(st))[0]
    new_text, _, pick = link_occurrence("pray to cuthbert's shrine", hit, st)
    assert new_text == f"pray to @[St. Cuthbert]({st.id}) shrine"
    assert pick is None


# --- 4.6 auto-link (v3) ---


def test_auto_link_wraps_plain_names_with_exact_text_as_label():
    g = ent("Grimbold Ironhand")
    text, ids = auto_link("paid grimbold 5gp", index(g))
    assert text == f"paid @[grimbold]({g.id}) 5gp"
    assert ids == {g.id}
    assert strip_tokens(text) == "paid grimbold 5gp"


def test_auto_link_never_links_the_player_character():
    pc = ent("Wren Ashdown", type_id="type-character")
    text, ids = auto_link("wren ashdown waved", index(pc), never=[pc.id])
    assert text == "wren ashdown waved"
    assert ids == set()


def test_auto_link_overlaps_keep_earliest_then_longest():
    mira = ent("Mira Vane")
    street = ent("Vane Street", type_id="type-location")
    text, ids = auto_link("mira vane street", index(mira, street))
    assert ids == {mira.id}
    assert text == f"@[mira vane]({mira.id}) street"


def test_auto_link_skips_names_with_square_brackets():
    room = ent("Room [4]", type_id="type-location")
    assert auto_link("in room [4]", index(room))[0] == "in room [4]"


def test_resolve_note_typed_and_auto_links():
    grim = ent("Grimbold Ironhand")
    bess = ent("Old Bess")
    r = resolve_note("@Grimbold paid bess, then grimbold left", index(grim, bess))
    assert r.links == {grim.id: "typed", bess.id: "auto"}
    assert r.text == (
        f"@[Grimbold]({grim.id}) paid @[bess]({bess.id}), then @[grimbold]({grim.id}) left"
    )


def test_resolve_note_auto_link_never_creates_anything():
    r = resolve_note("met someone called Pip", index())
    assert r.candidates == ()
    assert r.links == {}
    assert r.text == "met someone called Pip"


def test_candidates_are_matchable_in_the_same_note_and_later():
    r = resolve_note("@Pip sells info. pip is a kid", index(), new_candidate_id=lambda n: "pip")
    assert r.links == {"pip": "typed"}
    assert r.text == "@[Pip](pip) sells info. @[pip](pip) is a kid"
    later = resolve_note("pip says boats come in", index(*r.candidates))
    assert later.links == {"pip": "auto"}


def test_candidate_loses_to_real_entity_on_exact_name():
    from tests.helpers import candidate

    c = candidate("Vex", updated_at="2026-09-30T00:00:00.000Z")
    real = ent("Vex")
    assert resolve_note("vex", index(c, real)).links == {real.id: "auto"}


def test_confirmed_links_stay_confirmed_on_edit():
    grim = ent("Grimbold Ironhand")
    r = resolve_note("@Grimbold_Ironhand", index(grim), prior_how={grim.id: "confirmed"})
    assert r.links == {grim.id: "confirmed"}


def test_passed_through_stored_tokens_keep_their_kind():
    grim = ent("Gorm Ironhand")
    stored = f"paid @[grimbold]({grim.id}) back"
    assert resolve_note(stored, index(grim), prior_how={grim.id: "auto"}).links == {grim.id: "auto"}
    assert resolve_note("@[Old Tom](gone)", index()).links == {"gone": "typed"}


def test_typed_beats_auto_for_the_same_entity():
    a = ent("Aldric")
    r = resolve_note("aldric then @Aldric", index(a), picks=[Pick("Aldric", a.id)])
    assert r.links == {a.id: "typed"}


def test_tags_derived():
    assert resolve_note("paid #debts and #Debts", index()).tags == ["debts"]


def test_auto_link_does_not_turn_following_text_into_a_mention_or_tag():
    # Found by Hypothesis: "grimbold@grimbold" has no mention; wrapping the first
    # "grimbold" must not make the second one count.
    g = ent("Grimbold Ironhand")
    r = resolve_note("grimbold@grimbold#debts", index(g))
    assert r.text == f"@[grimbold]({g.id})@grimbold#debts"
    assert r.tags == []
    assert resolve_note(r.text, index(g), prior_how=r.links).text == r.text
