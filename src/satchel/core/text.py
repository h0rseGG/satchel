"""Shared text rules for names, mentions, tags and search (SPEC 4).

Python's `re` has no `\\p{L}`, so we lean on two facts about `str` patterns:
- `\\w` matches letters, digits (any script) and underscore: the same set as v2's
  `[\\p{L}\\p{N}_]`.
- "starts with a letter" is checked with `str.isalpha()` after matching, rather than
  trying to spell "letter" as a regex.
"""

import re
import unicodedata

# The @/# start rule: not straight after a word character, so "bob@inn.com" and
# "mid#dle" don't trigger.
NOT_AFTER_WORD = r"(?<!\w)"

# Characters allowed inside an @token or #tag after its first letter.
TOKEN_BODY = r"[\w'’\-]*"

_CURLY_APOSTROPHES = str.maketrans({"‘": "'", "’": "'", "ʼ": "'"})
_SPACES = re.compile(r"\s+")


def key(s: str | None) -> str:
    """Comparison key for names, aliases and tags.

    Case, Unicode form, curly apostrophes and runs of spaces don't make two names
    different: "Lyra’s  Locket" and "lyra's locket" share a key.
    """
    s = unicodedata.normalize("NFC", s or "").translate(_CURLY_APOSTROPHES)
    return _SPACES.sub(" ", s).strip().lower()


def letter_count(s: str) -> int:
    return sum(1 for ch in s if ch.isalpha())


def is_word_char(ch: str) -> bool:
    """True for letters, digits and underscore (the `\\w` set)."""
    return ch == "_" or ch.isalnum()


def name_words(name: str) -> list[str]:
    """Words of a name with surrounding punctuation trimmed: "(Grim)" -> "Grim"."""
    out = []
    for word in name.split():
        # Strip anything that isn't a letter or digit from both ends.
        start, end = 0, len(word)
        while start < end and not word[start].isalnum():
            start += 1
        while end > start and not word[end - 1].isalnum():
            end -= 1
        if start < end:
            out.append(word[start:end])
    return out


# URLs, so "#" and "@" inside them aren't read as tags or mentions.
_URL_RE = re.compile(r"\b(?:https?://|www\.)[^\s<>\"]+", re.IGNORECASE)

Span = tuple[int, int]


def url_spans(text: str) -> list[Span]:
    return [m.span() for m in _URL_RE.finditer(text)]


def in_spans(pos: int, spans: list[Span]) -> bool:
    return any(a <= pos < b for a, b in spans)


def overlaps(start: int, end: int, spans: list[Span]) -> bool:
    return any(start < b and a < end for a, b in spans)


def trim_token(raw: str) -> str:
    """Drop trailing `_ - '` and a possessive "'s" from an @token or #tag.

    Repeats until nothing changes, so "Aldric_-" -> "Aldric" and "Mira’s" -> "Mira".
    """
    while True:
        trimmed = re.sub(r"[_\-'’]+$", "", raw)
        trimmed = re.sub(r"['’][sS]$", "", trimmed)
        if trimmed == raw:
            return raw
        raw = trimmed
