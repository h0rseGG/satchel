"""Short names: people say "Grimbold", not "Grimbold Ironhand" (SPEC 4.3)."""

from collections import defaultdict
from collections.abc import Iterable

from satchel.core.model import Entity, EntityType, is_person
from satchel.core.text import key, letter_count, name_words

# Titles and honorifics never become short names (SPEC 4.6.11): they're everyday words at
# the table ("my lord", "the guard captain", "oh brother"), and auto-link would turn each
# use into a stored link. To make a title link on purpose, give the person it as an alias.
# Words under 4 letters ("sir") are already excluded by the length rule.
TITLE_WORDS = frozenset({
    # nobility
    "lady", "lord", "dame", "king", "queen", "prince", "princess", "duke", "duchess",
    "baron", "baroness", "count", "countess", "earl", "emperor", "empress",
    # military
    "captain", "sergeant", "commander", "general", "admiral", "lieutenant", "marshal",
    # family and religious
    "sister", "brother", "father", "mother", "master", "mistress", "elder", "saint",
    "bishop", "abbot", "abbess", "priest", "priestess",
})  # fmt: skip


def short_names(
    entities: Iterable[Entity], types_by_id: dict[str, EntityType]
) -> dict[str, Entity]:
    """Map of word key -> entity, for people (person types and candidates) only.

    A word counts when it has 4+ letters, isn't a title, and belongs to no other entity:
    it isn't a word of another name, and it isn't another entity's whole name or alias.
    So a shared surname ("Ashdown") never counts, and no title ("Lord") ever does.
    """
    entities = list(entities)

    # Who owns each word, and who owns each whole name/alias. Sets of ids, because the
    # question is always "does anyone *else* own this?"
    word_owners: dict[str, set[str]] = defaultdict(set)
    full_owners: dict[str, set[str]] = defaultdict(set)
    for e in entities:
        for w in name_words(e.name):
            word_owners[key(w)].add(e.id)
        for n in (e.name, *e.aliases):
            full_owners[key(n)].add(e.id)

    def owned_by_others(owners: dict[str, set[str]], k: str, entity_id: str) -> bool:
        return bool(owners.get(k, set()) - {entity_id})

    out: dict[str, Entity] = {}
    for e in entities:
        if not is_person(e, types_by_id):
            continue
        words = name_words(e.name)
        if len(words) < 2:
            continue  # a one-word name is already its own exact match
        for w in words:
            k = key(w)
            if letter_count(w) < 4 or k in TITLE_WORDS or k in out:
                continue
            if owned_by_others(word_owners, k, e.id) or owned_by_others(full_owners, k, e.id):
                continue
            out[k] = e
    return out
