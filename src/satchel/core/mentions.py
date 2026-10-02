"""@mentions: parsing, the name index, typed resolution and editing (SPEC 4.1).

Display is in display.py, autocomplete in autocomplete.py, and auto-linking of plain
names in matcher.py; they all build on this module.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass, field

from satchel.core.model import Entity, EntityType, new_id
from satchel.core.shortnames import short_names
from satchel.core.tags import STORED_RE
from satchel.core.text import (
    NOT_AFTER_WORD,
    TOKEN_BODY,
    in_spans,
    is_word_char,
    key,
    overlaps,
    trim_token,
    url_spans,
)

# Typed form: "@Name" at the start of the text or after a non-word character.
# The first-letter rule ("@5pm" stays text) is checked in find_typed.
_TYPED_RE = re.compile(NOT_AFTER_WORD + r"@(\w" + TOKEN_BODY + r")")


@dataclass(frozen=True)
class StoredToken:
    start: int
    end: int
    label: str
    id: str


@dataclass(frozen=True)
class TypedToken:
    start: int
    end: int
    raw: str  # as typed, after trimming: "Lord_Aldric"
    name: str  # what it means: "Lord Aldric"


@dataclass(frozen=True)
class Pick:
    """The capture box remembers which entity the user chose for a typed name."""

    name: str
    id: str


def typed_name(raw: str) -> str:
    return re.sub(r"_+", " ", raw).strip()


def stored_token(label: str, entity_id: str) -> str:
    """ "@[label](id)". Square brackets would break the token, so they're stripped."""
    clean = label.replace("[", "").replace("]", "").strip()
    return f"@[{clean}]({entity_id})"


def find_stored(text: str) -> list[StoredToken]:
    return [
        StoredToken(m.start(), m.end(), m.group(1), m.group(2)) for m in STORED_RE.finditer(text)
    ]


def find_typed(text: str) -> list[TypedToken]:
    """Typed @tokens outside URLs and stored tokens."""
    stored = [(s.start, s.end) for s in find_stored(text)]
    urls = url_spans(text)
    stored_ends = {end for _, end in stored}
    out = []
    for m in _TYPED_RE.finditer(text):
        if not m.group(1)[0].isalpha() or in_spans(m.start(), stored):
            continue
        # A token touching a URL is part of it: "@https://x.com" isn't a mention of "https".
        if overlaps(m.start(), m.end(), urls):
            continue
        # A stored token counts as a word for the start rule. Otherwise "grimbold@x"
        # (not a mention) would become one once "grimbold" is auto-linked.
        if m.start() in stored_ends:
            continue
        raw = trim_token(m.group(1))
        if raw:
            out.append(TypedToken(m.start(), m.start() + 1 + len(raw), raw, typed_name(raw)))
    return out


def mention_ids(stored_text: str) -> list[str]:
    """Entity ids in a stored text, unique, in order of first appearance."""
    return list(dict.fromkeys(s.id for s in find_stored(stored_text)))


def strip_tokens(stored_text: str) -> str:
    """Stored text with each token replaced by its label."""
    return STORED_RE.sub(lambda m: m.group(1), stored_text)


# --- Name index --------------------------------------------------------------


@dataclass
class NameIndex:
    """Built once per save (not per keystroke): every way of naming an entity."""

    entities: list[Entity]
    types_by_id: dict[str, EntityType]
    by_id: dict[str, Entity]
    exact: dict[str, list[Entity]]  # name/alias key -> entities, preferred first
    short: dict[str, Entity]  # short-name key -> entity
    name_keys: dict[str, tuple[str, ...]]  # entity id -> keys of name and aliases
    phrase_table: dict | None = field(default=None, repr=False)  # built by matcher.py

    def with_entities(self, extra: Iterable[Entity]) -> NameIndex:
        return build_name_index([*self.entities, *extra], self.types_by_id)


def newest_first(entities: list[Entity]) -> list[Entity]:
    """Most recently edited first; ties by id, so the order never depends on input order.

    Two stable sorts: the last sort decides, earlier ones break its ties.
    """
    out = sorted(entities, key=lambda e: e.id)
    out.sort(key=lambda e: e.updated_at, reverse=True)
    return out


def _preferred(entities: list[Entity]) -> list[Entity]:
    # Several exact matches: a real entity beats a candidate, then newest first.
    out = newest_first(entities)
    out.sort(key=lambda e: e.is_candidate)
    return out


def build_name_index(entities: Iterable[Entity], types_by_id: dict[str, EntityType]) -> NameIndex:
    entities = list(entities)
    exact: dict[str, list[Entity]] = {}
    name_keys: dict[str, tuple[str, ...]] = {}
    for e in entities:
        keys = tuple(k for k in (key(n) for n in (e.name, *e.aliases)) if k)
        name_keys[e.id] = keys
        for k in keys:
            bucket = exact.setdefault(k, [])
            if e not in bucket:
                bucket.append(e)
    exact = {k: _preferred(bucket) for k, bucket in exact.items()}
    return NameIndex(
        entities=entities,
        types_by_id=types_by_id,
        by_id={e.id: e for e in entities},
        exact=exact,
        short=short_names(entities, types_by_id),
        name_keys=name_keys,
    )


def lookup_name(name: str, index: NameIndex) -> Entity | None:
    """Exact name or alias first, then short name."""
    k = key(name)
    if k in index.exact:
        return index.exact[k][0]
    return index.short.get(k)


# --- Typed resolution on save ------------------------------------------------


@dataclass(frozen=True)
class TypedResolution:
    text: str
    typed_ids: frozenset[str]
    candidates: tuple[Entity, ...]


def resolve_typed(
    text: str,
    index: NameIndex,
    *,
    picks: Iterable[Pick] = (),
    now: str = "",
    new_candidate_id=None,
) -> TypedResolution:
    """Turn typed @tokens into stored tokens (SPEC 4.1 and 4.6.1).

    Order: the autocomplete pick, exact name or alias, short name, else a new candidate
    (one per name per save). Existing stored tokens pass through untouched.
    `new_candidate_id(name)` lets the demo use stable ids; the app uses random ones.
    """
    picks = list(picks)
    made: dict[str, Entity] = {}
    typed_ids: set[str] = set()
    parts: list[str] = []
    pos = 0
    for tok in find_typed(text):
        k = key(tok.name)
        pick = next((p for p in picks if key(p.name) == k and p.id in index.by_id), None)
        entity = index.by_id[pick.id] if pick else lookup_name(tok.name, index) or made.get(k)
        if entity is None:
            cid = new_candidate_id(tok.name) if new_candidate_id else new_id()
            entity = Entity(
                id=cid,
                name=tok.name,
                type_id=None,
                is_candidate=True,
                created_at=now,
                updated_at=now,
            )
            made[k] = entity
        typed_ids.add(entity.id)
        parts.append(text[pos : tok.start] + stored_token(tok.name, entity.id))
        pos = tok.end
    parts.append(text[pos:])
    return TypedResolution("".join(parts), frozenset(typed_ids), tuple(made.values()))


# --- Editing -----------------------------------------------------------------


def mention_text(entity: Entity, following: str = "") -> tuple[str, bool]:
    """How an entity is typed: ("@Lord_Aldric", True).

    Names that can't survive the round trip ("St. Cuthbert", or "Mira" followed by
    "-chan") come back as a stored token instead: (token, False).
    """
    typed = "@" + "_".join(entity.name.split())
    found = find_typed(typed + following)
    back = found[0] if found else None
    ok = (
        back is not None
        and back.start == 0
        and back.end == len(typed)
        and key(back.name) == key(entity.name)
    )
    return (typed, True) if ok else (stored_token(entity.name, entity.id), False)


def to_typed_form(
    stored_text: str, index: NameIndex, how_by_id: dict[str, str] | None = None
) -> tuple[str, list[Pick]]:
    """Stored text -> what the edit box shows, plus picks pinning each typed token.

    - Typed and confirmed links show typed form (current name), pinned with a pick.
    - Auto links show their plain label and are re-matched on save (SPEC 4.6.7). If the
      label no longer names that entity (it was renamed), the token stays stored so the
      link isn't silently lost.
    - Tokens whose entity is gone stay stored, so an edit never makes candidates.
    """
    how_by_id = how_by_id or {}
    picks: list[Pick] = []
    parts: list[str] = []
    pos = 0
    prev_end = -1  # end of the previous token, to spot two tokens touching
    for s in find_stored(stored_text):
        parts.append(stored_text[pos : s.start])
        pos = s.end
        original = stored_text[s.start : s.end]
        entity = index.by_id.get(s.id)
        # "@Name" only reads back as a mention after a non-word character, and not
        # straight after another token. Otherwise keep the stored form.
        before = stored_text[s.start - 1] if s.start > 0 else " "
        can_type = not is_word_char(before) and s.start != prev_end
        prev_end = s.end
        if entity is None:
            parts.append(original)
        elif how_by_id.get(s.id) == "auto":
            still_names_it = lookup_name(s.label, index) == entity
            parts.append(s.label if still_names_it else original)
        elif not can_type:
            parts.append(original)
        else:
            shown, typed = mention_text(entity, stored_text[s.end : s.end + 40])
            parts.append(shown)
            if typed:
                picks.append(Pick(entity.name, entity.id))
    parts.append(stored_text[pos:])
    return "".join(parts), picks
