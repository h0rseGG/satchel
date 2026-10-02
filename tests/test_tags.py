"""SPEC 4.4 tags. Every case from v2-final:tests/unit/tags.test.js, plus v3 extras."""

from satchel.core.tags import find_tags, suggest_tags, tag_counts, tag_keys, typed_tag


def test_tag_and_two_words():
    assert tag_keys("met him #debts and #do_NOT_trust") == ["debts", "do not trust"]


def test_only_at_start_or_after_non_word_character():
    assert tag_keys("#start mid#dle (#paren)") == ["start", "paren"]


def test_urls_with_hash_are_not_tags():
    text = "see https://example.com/page#section and www.x.com/#a #real"
    assert tag_keys(text) == ["real"]


def test_must_start_with_a_letter():
    assert tag_keys("#1 priority at #3pm, # heading") == []
    assert tag_keys("#_under") == []


def test_trailing_characters_and_possessive_dropped():
    tags = find_tags("#lyra’s #debts_ #rivals-")
    assert [t.key for t in tags] == ["lyra", "debts", "rivals"]
    assert "#lyra’s"[tags[0].start : tags[0].end] == "#lyra"


def test_unicode_letters():
    assert tag_keys("#öl #日本") == ["öl", "日本"]


def test_tags_inside_stored_mention_labels_are_ignored():
    assert tag_keys("@[Room #4](abc) #real") == ["real"]


def test_keys_unique_lower_case_first_seen_order():
    assert tag_keys("#B #a #b") == ["b", "a"]


def test_suggestions_prefix_then_substring_most_used_first():
    # v2 counted deleted notes out; v3 has real deletes, so there's nothing to skip.
    counts = tag_counts([["debts"], ["debts", "do not trust"], ["old debts"]])
    assert [k for k, _ in suggest_tags("d", counts)] == ["debts", "do not trust", "old debts"]
    assert [k for k, _ in suggest_tags("debt", counts)] == ["debts", "old debts"]
    assert typed_tag("do not trust") == "#do_not_trust"


def test_counts_one_per_note_even_if_repeated():
    assert tag_counts([["a", "a"], ["a"]])["a"] == 2


def test_suggestions_limit():
    counts = tag_counts([[f"t{i}"] for i in range(8)])
    assert len(suggest_tags("t", counts)) == 5


def test_hash_touching_a_url_is_not_a_tag():
    assert tag_keys("#https://x.com/a") == []
