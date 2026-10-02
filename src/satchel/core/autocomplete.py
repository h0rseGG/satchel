"""Capture-box autocomplete for @mentions (SPEC 4.2). Tag suggestions are in tags.py."""

from dataclasses import dataclass

from satchel.core.mentions import (
    NameIndex,
    Pick,
    find_stored,
    mention_text,
    newest_first,
    typed_name,
)
from satchel.core.model import Entity
from satchel.core.text import in_spans, is_word_char, key, url_spans


@dataclass(frozen=True)
class ActiveToken:
    kind: str  # "@" or "#"
    start: int
    end: int
    query: str


def _is_token_char(ch: str) -> bool:
    return is_word_char(ch) or ch in "'’-"


def active_token(text: str, caret: int) -> ActiveToken | None:
    """The @ or # token the caret is in, if any."""
    i = caret
    while i > 0 and _is_token_char(text[i - 1]):
        i -= 1
    if i == 0 or text[i - 1] not in "@#":
        return None
    start = i - 1
    if start > 0 and is_word_char(text[start - 1]):
        return None  # "bob@inn"
    if any(s.end == start for s in find_stored(text)):
        return None  # straight after a stored token, which counts as a word
    if in_spans(start, url_spans(text)):
        return None
    typed = text[i:caret]
    if typed and not typed[0].isalpha():
        return None
    end = caret
    while end < len(text) and _is_token_char(text[end]):
        end += 1
    return ActiveToken(text[start], start, end, typed_name(typed))


def suggest_entities(query: str, index: NameIndex, limit: int = 5) -> list[Entity]:
    """Prefix matches on name or alias first, then substring matches; newest first."""
    q = key(query)
    prefix, substring = [], []
    for e in index.entities:
        keys = index.name_keys[e.id]
        if any(k.startswith(q) for k in keys):
            prefix.append(e)
        elif any(q in k for k in keys):
            substring.append(e)
    return (newest_first(prefix) + newest_first(substring))[:limit]


def replace_token(text: str, token: ActiveToken, insert: str) -> tuple[str, int]:
    """Replace the active token with `insert` and a trailing space. Returns (text, caret)."""
    after = text[token.end :]
    space = "" if after[:1].isspace() else " "
    return text[: token.start] + insert + space + after, token.start + len(insert) + 1


def apply_entity_pick(
    text: str, token: ActiveToken, entity: Entity
) -> tuple[str, int, Pick | None]:
    shown, typed = mention_text(entity)
    new_text, caret = replace_token(text, token, shown)
    return new_text, caret, Pick(entity.name, entity.id) if typed else None
