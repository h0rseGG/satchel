"""Note tags: "#tag", "#two_words" (SPEC 4.4)."""

import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass

from satchel.core.text import NOT_AFTER_WORD, TOKEN_BODY, in_spans, key, trim_token, url_spans

# Same start rule as @mentions. The first-letter check happens in find_tags.
_TAG_RE = re.compile(NOT_AFTER_WORD + r"#(" + r"\w" + TOKEN_BODY + r")")

# Stored mention tokens, "@[label](id)". Kept here (not in mentions.py) because tags
# must skip them too, and mentions.py imports this module.
STORED_RE = re.compile(r"@\[([^\]]*)\]\(([^)\s]+)\)")


@dataclass(frozen=True)
class TagSpan:
    start: int
    end: int  # excludes dropped trailing characters
    raw: str
    key: str


def tag_key(raw: str) -> str:
    """Turns "do_NOT_trust" into "do not trust"."""
    return key(raw.replace("_", " "))


def find_tags(text: str) -> list[TagSpan]:
    """Every #tag in the text, skipping URLs and stored mention tokens."""
    skip = url_spans(text) + [m.span() for m in STORED_RE.finditer(text)]
    out = []
    for m in _TAG_RE.finditer(text):
        # Must start with a letter, so "#1" and "#3pm" stay text.
        if not m.group(1)[0].isalpha() or in_spans(m.start(), skip):
            continue
        raw = trim_token(m.group(1))
        if raw:
            out.append(TagSpan(m.start(), m.start() + 1 + len(raw), raw, tag_key(raw)))
    return out


def tag_keys(text: str) -> list[str]:
    """Derived note tags: unique keys in order of first appearance."""
    return list(dict.fromkeys(t.key for t in find_tags(text)))


def tag_counts(tag_lists: Iterable[Iterable[str]]) -> Counter[str]:
    """How many notes use each tag key."""
    counts: Counter[str] = Counter()
    for tags in tag_lists:
        counts.update(set(tags))
    return counts


def suggest_tags(query: str, counts: Counter[str], limit: int = 5) -> list[tuple[str, int]]:
    """Capture-box suggestions: prefix matches, then substring matches, most used first."""
    q = tag_key(query)

    def rank(k: str) -> int:
        return 0 if k.startswith(q) else 1 if q in k else 2

    hits = [(k, n) for k, n in counts.items() if rank(k) < 2]
    hits.sort(key=lambda kn: (rank(kn[0]), -kn[1], kn[0]))
    return hits[:limit]


def typed_tag(tag: str) -> str:
    """How a picked tag is typed back into the box: "do not trust" -> "#do_not_trust"."""
    return "#" + tag.replace(" ", "_")
