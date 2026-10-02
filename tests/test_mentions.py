"""SPEC 4.1, 4.2, display. Every case from v2-final:tests/unit/mentions.test.js
(short-name and recall cases are in test_shortnames.py and test_matcher.py).

v3 differences: stubs are candidates (is_candidate), deletes are real (a deleted
entity is simply absent from the index), and there is no merge.
"""

from satchel.core.autocomplete import active_token, apply_entity_pick, suggest_entities
from satchel.core.display import display_label, plain_text, segments
from satchel.core.mentions import (
    Pick,
    build_name_index,
    find_typed,
    mention_ids,
    resolve_typed,
    strip_tokens,
    to_typed_form,
)
from tests.helpers import T0, TYPES_BY_ID, candidate, ent


def names(text):
    return [t.name for t in find_typed(text)]


def index(*entities):
    return build_name_index(entities, TYPES_BY_ID)


# --- 4.1 typed form ---


def test_at_name_and_multi_word():
    assert names("saw @Grimbold and @Lord_Aldric") == ["Grimbold", "Lord Aldric"]


def test_possessive_dropped_and_kept_as_text_straight_and_curly():
    text = "met @Mira’s cat and @Mira's dog"
    found = find_typed(text)
    assert [t.name for t in found] == ["Mira", "Mira"]
    assert text[found[0].end : found[0].end + 2] == "’s"


def test_trailing_underscore_hyphen_apostrophe_dropped():
    assert names("@Grim_ @Mira- @Lyra’ @Aldric_-") == ["Grim", "Mira", "Lyra", "Aldric"]


def test_emails_do_not_trigger_start_and_after_punctuation_do():
    assert names('mail bob@inn.com @Start (@Paren) "@Quote"') == ["Start", "Paren", "Quote"]


def test_unicode_letters():
    assert names("@Zoë and @Ærin_Þór") == ["Zoë", "Ærin Þór"]


def test_at_followed_by_digit_or_space_stays_text():
    assert names("meet @5pm @ the inn") == []


def test_at_inside_urls_ignored():
    assert names("https://mastodon.social/@someone @Real") == ["Real"]


# --- 4.1 resolution ---


def test_resolution_order_pick_exact_short_candidate():
    grim = ent("Grimbold Ironhand")
    grim2 = ent("Grimbold", type_id="type-other")
    mira = ent("Mira Vane", aliases=["The Fox"])
    idx = index(grim, grim2, mira)

    r = resolve_typed("@grimbold", idx)
    assert mention_ids(r.text) == [grim2.id], "exact name beats short name"

    r = resolve_typed("@grimbold", idx, picks=[Pick("Grimbold", grim.id)])
    assert mention_ids(r.text) == [grim.id], "pick beats exact"

    r = resolve_typed("@the_fox and @vane", idx)
    assert mention_ids(r.text) == [mira.id], "alias and short name both resolve to Mira"
    assert r.candidates == ()

    r = resolve_typed("@Nobody and @nobody again", idx, now=T0)
    assert len(r.candidates) == 1, "one candidate per name per save"
    c = r.candidates[0]
    assert (c.name, c.is_candidate, c.type_id, c.created_at) == ("Nobody", True, None, T0)
    assert mention_ids(r.text) == [c.id]


def test_several_exact_matches_real_entity_then_most_recently_edited():
    c = candidate("Bob", updated_at="2026-09-09T00:00:00.000Z")
    old = ent("Bob", updated_at="2026-09-01T00:00:00.000Z")
    recent = ent("Bob", updated_at="2026-09-05T00:00:00.000Z")
    assert mention_ids(resolve_typed("@Bob", index(c, old, recent)).text) == [recent.id]


def test_stored_form_labels_as_typed_possessive_kept_as_text():
    mira = ent("Mira Vane")
    assert resolve_typed("@Mira’s back", index(mira)).text == f"@[Mira]({mira.id})’s back"
    r = resolve_typed("@Bob", index(), now=T0, new_candidate_id=lambda name: "sid")
    assert r.text == "@[Bob](sid)"


def test_existing_stored_tokens_pass_through_untouched():
    r = resolve_typed("@[Ghost](gone-id) met @Ghost", index(), new_candidate_id=lambda n: "new")
    assert r.text == "@[Ghost](gone-id) met @[Ghost](new)"
    assert mention_ids(r.text) == ["gone-id", "new"]


def test_pick_for_a_deleted_entity_falls_back_to_normal_resolution():
    # v3: deleted entities aren't in the index at all.
    live = ent("Mira")
    r = resolve_typed("@Mira", index(live), picks=[Pick("Mira", "deleted-id")])
    assert mention_ids(r.text) == [live.id]


def test_typed_ids_reported():
    a = ent("Aldric")
    r = resolve_typed("@Aldric and @Newbie", index(a), new_candidate_id=lambda n: "c1")
    assert r.typed_ids == {a.id, "c1"}


# --- 4.1 editing ---


def test_edit_typed_form_with_current_names_re_resolves_to_same_entities():
    ald = ent("Lord Aldric Thorne")
    other = ent("Aldric", type_id="type-other")
    idx = index(ald, other)
    text, picks = to_typed_form(f"paid @[aldric]({ald.id}) back", idx)
    assert text == "paid @Lord_Aldric_Thorne back"
    assert mention_ids(resolve_typed(text, idx, picks=picks).text) == [ald.id]


def test_edit_tokens_of_missing_entities_untouched_and_never_make_candidates():
    stored = "@[Old Tom](deleted-id) and @[X](missing)"
    text, _ = to_typed_form(stored, index())
    assert text == stored
    r = resolve_typed(text, index())
    assert r.candidates == ()
    assert r.text == stored


def test_edit_names_that_cannot_be_typed_back_stay_stored():
    st = ent("St. Cuthbert")
    mira = ent("Mira")
    stored = f"@[St. Cuthbert]({st.id}) @[Mira]({mira.id})-chan"
    text, picks = to_typed_form(stored, index(st, mira))
    assert text == stored, 'a following "-chan" would change the name'
    assert picks == []


def test_edit_auto_links_show_as_plain_label():
    grim = ent("Grimbold Ironhand")
    stored = f"paid @[grimbold]({grim.id}) back"
    text, picks = to_typed_form(stored, index(grim), {grim.id: "auto"})
    assert (text, picks) == ("paid grimbold back", [])


def test_edit_auto_link_whose_label_no_longer_matches_stays_stored():
    # "Grimbold" was renamed: plain "grimbold" wouldn't re-match, so keep the token.
    grim = ent("Gorm Ironhand")
    stored = f"paid @[grimbold]({grim.id}) back"
    text, _ = to_typed_form(stored, index(grim), {grim.id: "auto"})
    assert text == stored


def test_edit_confirmed_links_show_typed_form():
    grim = ent("Grimbold Ironhand")
    text, picks = to_typed_form(f"@[grimbold]({grim.id})", index(grim), {grim.id: "confirmed"})
    assert text == "@Grimbold_Ironhand"
    assert picks == [Pick("Grimbold Ironhand", grim.id)]


# --- display ---


def test_display_label_typed_form_while_still_a_name_else_current_name():
    e = ent("Captain Rook Harlow", aliases=["The Crow"])
    assert display_label("rook", e) == "Rook", "a word of the name, spelled the entity's way"
    assert display_label("captain rook", e) == "Captain Rook"
    assert display_label("the crow", e) == "The Crow", "alias"
    assert display_label("Grimbol", e) == "Captain Rook Harlow", "no longer a name"
    assert display_label("rook harlow captain", e) == "Captain Rook Harlow"


def test_segments_mentions_show_typed_name_tags_marked():
    m = ent("Mira Vane")
    segs = segments(f"@[mira]({m.id})’s back #lyra", {m.id: m})
    assert [(s.kind, s.text, s.id, s.missing, s.key) for s in segs] == [
        ("mention", "Mira", m.id, False, None),
        ("text", "’s back ", None, False, None),
        ("tag", "#lyra", None, False, "lyra"),
    ]


def test_missing_entity_shows_stored_label_marked_missing():
    segs = segments("@[Old Tom](gone)", {})
    assert (segs[0].text, segs[0].missing) == ("Old Tom", True)
    assert plain_text("hi @[Old Tom](gone)", {}) == "hi Old Tom"


def test_strip_tokens():
    assert strip_tokens("a @[b](1) c @[d e](2)") == "a b c d e"


# --- 4.2 autocomplete ---


def test_active_token_for_at_and_hash_with_query():
    t = active_token("hi @Lord_Al", 11)
    assert (t.kind, t.start, t.end, t.query) == ("@", 3, 11, "Lord Al")
    t = active_token("hi @", 4)
    assert (t.kind, t.start, t.end, t.query) == ("@", 3, 4, "")
    assert active_token("bob@inn", 7) is None
    assert active_token("hi there", 8) is None
    t = active_token("x #deb more", 6)
    assert (t.kind, t.start, t.end, t.query) == ("#", 2, 6, "deb")
    assert active_token("see https://a.com/#frag", 23) is None


def test_suggestions_prefix_first_then_substring_newest_first_max_5():
    a = ent("Aldric", updated_at="2026-09-01T00:00:00.000Z")
    b = ent("Alda", updated_at="2026-09-03T00:00:00.000Z")
    c = ent("Lord Aldric", updated_at="2026-09-05T00:00:00.000Z")
    d = ent("Hal", aliases=["Aldo"], updated_at="2026-09-02T00:00:00.000Z")
    got = [e.name for e in suggest_entities("ald", index(a, b, c, d))]
    assert got == ["Alda", "Hal", "Aldric", "Lord Aldric"]
    many = index(*[ent(f"Al{i}") for i in range(8)])
    assert len(suggest_entities("al", many)) == 5


def test_picking_inserts_typed_form_and_records_pick():
    ald = ent("Lord Aldric")
    tok = active_token("met @lo", 7)
    text, caret, pick = apply_entity_pick("met @lo", tok, ald)
    assert text == "met @Lord_Aldric "
    assert caret == len(text)
    assert pick == Pick("Lord Aldric", ald.id)


# --- edge cases found by Hypothesis ---


def test_at_touching_a_url_is_not_a_mention():
    assert names("@https://x.com/@grimbold") == []


def test_stored_label_never_starts_inside_a_stray_bracket():
    from satchel.core.mentions import find_stored

    found = find_stored("x@[@[grimbold](e2)")
    assert [(t.start, t.label) for t in found] == [(3, "grimbold")]


def test_edit_keeps_stored_form_where_typed_form_would_not_read_back():
    g = ent("Grimbold Ironhand")
    stored = f"x@[@[grimbold]({g.id})"
    assert to_typed_form(stored, index(g), {g.id: "typed"})[0] == "x@[@Grimbold_Ironhand"
    stored = f"word@[grimbold]({g.id})"
    assert to_typed_form(stored, index(g), {g.id: "typed"})[0] == stored
