"""SPEC 4.3 short names (v2 mentions.test.js cases)."""

from satchel.core.shortnames import short_names
from tests.helpers import TYPES_BY_ID, candidate, ent


def test_four_plus_letters_unique_words_people_only():
    es = [
        ent("Grimbold Ironhand"),
        ent("Sister Caldra"),
        ent("Sister Morwen"),
        ent("Wren Ashdown", type_id="type-character"),
        ent("Lyra Ashdown"),
        ent("Lord Aldric Thorne"),
        ent("Thorne Keep", type_id="type-location"),
        candidate("Old Bess"),
        ent("Iron Mill", type_id="type-location"),
    ]
    got = sorted(short_names(es, TYPES_BY_ID))
    # No "sister" (title, and shared), "ashdown" (shared surname), "thorne" (part of Thorne
    # Keep), "old" (3 letters), "keep"/"mill"/"iron" (not people). v3: "lord" is a title,
    # so unlike v2 it doesn't count even though only one person has it.
    assert got == [
        "aldric",
        "bess",
        "caldra",
        "grimbold",
        "ironhand",
        "lyra",
        "morwen",
        "wren",
    ]


def test_word_that_is_another_entitys_name_or_alias_is_not_a_short_name():
    es = [ent("Grimbold Ironhand"), ent("Hammer", type_id="type-item", aliases=["Grimbold"])]
    assert "grimbold" not in short_names(es, TYPES_BY_ID)


def test_threads_are_not_people():
    es = [ent("Missing Sister", type_id="type-thread")]
    assert short_names(es, TYPES_BY_ID) == {}


def test_possessive_word_is_its_own_word():
    # "Lyra’s Locket" doesn't take "lyra" from Lyra Ashdown (v2 demo behaviour).
    es = [ent("Lyra Ashdown"), ent("Lyra’s Locket", type_id="type-item")]
    assert short_names(es, TYPES_BY_ID)["lyra"].name == "Lyra Ashdown"


def test_titles_never_count_even_when_unique():
    es = [ent("Captain Rook Harlow"), ent("Brother Oswin"), candidate("Hollow King")]
    got = short_names(es, TYPES_BY_ID)
    assert sorted(got) == ["harlow", "hollow", "oswin", "rook"]


def test_an_alias_makes_a_title_link_on_purpose():
    from satchel.core.mentions import build_name_index, lookup_name

    hk = candidate("Hollow King", aliases=["King"])
    assert lookup_name("king", build_name_index([hk], TYPES_BY_ID)) == hk
