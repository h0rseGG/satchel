"""Names typed without @: recall, tap-to-link and auto-link (SPEC 4.3, 4.5, 4.6).

The same matcher serves the recall cards (per keystroke) and auto-link (on save), so
it has to be fast: the text is scanned once, word by word, and only names whose first
word appears are checked, with a plain character comparison rather than a regex per
name (v2 lesson: hundreds of compiled regexes took ~250 ms per save).
"""

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass

from satchel.core.mentions import (
    NameIndex,
    Pick,
    find_stored,
    find_typed,
    mention_ids,
    resolve_typed,
    stored_token,
    typed_name,
)
from satchel.core.model import HOW_AUTO, HOW_CONFIRMED, HOW_RANK, HOW_TYPED, Entity
from satchel.core.tags import find_tags, tag_keys
from satchel.core.text import is_word_char, overlaps, url_spans

_WORD_RUN = re.compile(r"\w+")
_FIRST_WORD = re.compile(r"^\w+")
_APOSTROPHES = "'’‘ʼ"


@dataclass(frozen=True)
class NameHit:
    start: int
    end: int
    id: str
    text: str  # exactly as it appears in the note


def _phrase_table(index: NameIndex) -> dict[str, list[tuple[str, str]]]:
    """First word -> [(phrase key, entity id)]. Cached on the index."""
    if index.phrase_table is None:
        table: dict[str, list[tuple[str, str]]] = {}

        def add(phrase: str, entity_id: str) -> None:
            first = _FIRST_WORD.match(phrase)
            if first:
                table.setdefault(first.group(0), []).append((phrase, entity_id))

        for k, bucket in index.exact.items():
            add(k, bucket[0].id)
        for k, e in index.short.items():
            if k not in index.exact:  # an exact name beats a short name
                add(k, e.id)
        index.phrase_table = table
    return index.phrase_table


def _match_at(text: str, pos: int, phrase: str) -> int:
    """Does `phrase` (a key) start at text[pos] and end at a word boundary?

    Returns the end index, or -1. A space in the phrase matches any run of whitespace;
    an apostrophe matches straight or curly ones.
    """
    i = pos
    n = len(text)
    for p in phrase:
        if p == " ":
            if i >= n or not text[i].isspace():
                return -1
            while i < n and text[i].isspace():
                i += 1
            continue
        if i >= n:
            return -1
        c = text[i]
        if p == "'":
            if c not in _APOSTROPHES:
                return -1
        elif c.lower() != p and unicodedata.normalize("NFC", c).lower() != p:
            return -1
        i += 1
    if i < n and is_word_char(text[i]):
        return -1
    return i


def find_names(text: str, index: NameIndex) -> list[NameHit]:
    """Plain-text names, aliases and short names, not inside @tokens, #tags or URLs."""
    skip = (
        url_spans(text)
        + [(s.start, s.end) for s in find_stored(text)]
        + [(t.start, t.end) for t in find_typed(text)]
        + [(t.start, t.end) for t in find_tags(text)]
    )
    table = _phrase_table(index)
    hits: list[NameHit] = []
    for run in _WORD_RUN.finditer(text):
        pos = run.start()
        # Runs are maximal, so the character before one is never a word character;
        # a name straight after @ or # belongs to a mention or tag.
        if pos > 0 and text[pos - 1] in "@#":
            continue
        phrases = table.get(unicodedata.normalize("NFC", run.group(0)).lower())
        if not phrases:
            continue
        for phrase, entity_id in phrases:
            end = _match_at(text, pos, phrase)
            if end >= 0 and not overlaps(pos, end, skip):
                hits.append(NameHit(pos, end, entity_id, text[pos:end]))

    # "lord aldric" means Lord Aldric, not also an entity called "Aldric" inside it.
    def inside_longer(h: NameHit) -> bool:
        return any(
            o is not h
            and o.start <= h.start
            and o.end >= h.end
            and o.end - o.start > h.end - h.start
            for o in hits
        )

    return [h for h in hits if not inside_longer(h)]


def named_entities(
    text: str, index: NameIndex, *, exclude: Iterable[str] = (), limit: int = 3
) -> list[Entity]:
    """Recall cards: entities named in the text, most recently typed first."""
    exclude = set(exclude)
    last_end: dict[str, int] = {}
    for h in find_names(text, index):
        if h.id not in exclude:
            last_end[h.id] = max(last_end.get(h.id, -1), h.end)
    ordered = sorted(last_end, key=lambda i: last_end[i], reverse=True)
    return [index.by_id[i] for i in ordered[:limit]]


def link_target(text: str, entity_id: str, index: NameIndex) -> NameHit | None:
    """Tap-to-link picks the occurrence that ends last; among those, the longest,
    so "lord aldric" beats the short name "aldric" inside it."""
    hits = [h for h in find_names(text, index) if h.id == entity_id]
    hits.sort(key=lambda h: (h.end, h.end - h.start), reverse=True)
    return hits[0] if hits else None


def link_occurrence(text: str, hit: NameHit, entity: Entity) -> tuple[str, int, Pick | None]:
    """Turn a plain occurrence into a typed mention. Returns (text, caret, pick)."""
    typed = "@" + "_".join(hit.text.split())
    found = find_typed(typed + text[hit.end : hit.end + 40])
    ok = bool(found) and found[0].start == 0 and found[0].end == len(typed)
    insert = typed if ok else stored_token(entity.name, entity.id)
    new_text = text[: hit.start] + insert + text[hit.end :]
    return new_text, hit.start + len(insert), Pick(typed_name(hit.text), entity.id) if ok else None


# --- Auto-link and note resolution (SPEC 4.6) -----------------------------------


def auto_link(
    text: str, index: NameIndex, *, never: Iterable[str] = ()
) -> tuple[str, frozenset[str]]:
    """Wrap plain-text names in stored tokens. Returns (text, ids auto-linked).

    The label is the exact matched text, so stripping tokens gives back what was typed.
    Overlapping hits (e.g. "mira vane street" with "Mira Vane" and "Vane Street") keep
    the earliest, then the longest. `never` holds ids that are never auto-linked (the
    player character).
    """
    never = set(never)
    hits = [h for h in find_names(text, index) if h.id not in never]
    # Labels can't hold square brackets, so a name containing one is left as text
    # rather than changing what was typed.
    hits = [h for h in hits if "[" not in h.text and "]" not in h.text]
    hits.sort(key=lambda h: (h.start, -(h.end - h.start)))
    parts: list[str] = []
    linked: set[str] = set()
    pos = 0
    for h in hits:
        if h.start < pos:
            continue
        parts.append(text[pos : h.start] + stored_token(h.text, h.id))
        linked.add(h.id)
        pos = h.end
    parts.append(text[pos:])
    return "".join(parts), frozenset(linked)


@dataclass(frozen=True)
class ResolvedNote:
    text: str  # stored form
    links: dict[str, str]  # entity id -> how, in order of first appearance
    tags: list[str]
    candidates: tuple[Entity, ...]  # new candidate entities to insert


def resolve_note(
    typed_text: str,
    index: NameIndex,
    *,
    picks: Iterable[Pick] = (),
    prior_how: dict[str, str] | None = None,
    never_auto: Iterable[str] = (),
    now: str = "",
    new_candidate_id=None,
) -> ResolvedNote:
    """Everything that happens to a note on save, as pure data.

    1. Typed @tokens -> stored tokens; unknown names become candidates (4.6.1).
    2. Plain names (including candidates just made) -> auto tokens (4.6.2, 4.6.3).
    3. One link per entity: confirmed if it was before, else typed if any token for it
       was typed, else auto (4.6.6). Stored tokens that passed through keep their old kind.
    """
    prior_how = prior_how or {}
    typed = resolve_typed(
        typed_text, index, picks=picks, now=now, new_candidate_id=new_candidate_id
    )
    auto_index = index.with_entities(typed.candidates) if typed.candidates else index
    text, auto_ids = auto_link(typed.text, auto_index, never=never_auto)

    links: dict[str, str] = {}
    for entity_id in mention_ids(text):
        kinds = []
        if entity_id in typed.typed_ids:
            kinds.append(HOW_TYPED)
        if entity_id in auto_ids:
            kinds.append(HOW_AUTO)
        if not kinds:  # a stored token that passed through untouched
            kinds.append(prior_how.get(entity_id, HOW_TYPED))
        how = max(kinds, key=HOW_RANK.__getitem__)
        if prior_how.get(entity_id) == HOW_CONFIRMED:
            how = HOW_CONFIRMED
        links[entity_id] = how
    return ResolvedNote(text, links, tag_keys(text), typed.candidates)
