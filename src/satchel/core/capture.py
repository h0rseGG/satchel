"""What the capture box shows while you type (SPEC 4.2, 4.5, 5.3). Pure, so the Qt
widget only has to draw it.

- `highlight_spans`: which parts of the typed text to colour, and how.
- `recall_ids`: which entities get recall cards.
- `apply_tag_pick`: Tab on a tag suggestion.
"""

from collections.abc import Iterable
from dataclasses import dataclass

from satchel.core.autocomplete import ActiveToken, replace_token
from satchel.core.matcher import find_names, named_entities
from satchel.core.mentions import NameIndex, find_stored, find_typed
from satchel.core.tags import find_tags

# Span kinds, matching the note display (SPEC 5.3): typed and stored tokens are chips;
# plain names that will auto-link are underlined; tags are muted.
TYPED = "typed"
AUTO = "auto"
TAG = "tag"
STORED = "stored"


@dataclass(frozen=True)
class Span:
    start: int
    end: int
    kind: str


def highlight_spans(text: str, index: NameIndex, *, never_auto: Iterable[str] = ()) -> list[Span]:
    """Spans to colour, sorted and non-overlapping. `never_auto` is the player
    character: it is never auto-linked, so it isn't shown as if it would be."""
    never = set(never_auto)
    spans = [Span(t.start, t.end, TYPED) for t in find_typed(text)]
    spans += [Span(s.start, s.end, STORED) for s in find_stored(text)]
    spans += [Span(t.start, t.end, TAG) for t in find_tags(text)]
    # find_names already skips typed tokens, stored tokens, tags and URLs.
    spans += [Span(h.start, h.end, AUTO) for h in find_names(text, index) if h.id not in never]
    return sorted(spans, key=lambda s: (s.start, s.end))


def recall_ids(
    text: str,
    index: NameIndex,
    *,
    highlighted_id: str | None = None,
    exclude: Iterable[str] = (),
    limit: int = 3,
) -> list[str]:
    """Recall cards (SPEC 4.5): the highlighted @suggestion first, then entities named
    in the text, most recently typed first. Never the player character (`exclude`)."""
    exclude = set(exclude)
    ids = [highlighted_id] if highlighted_id and highlighted_id not in exclude else []
    for e in named_entities(text, index, exclude=exclude | set(ids), limit=limit):
        ids.append(e.id)
    return ids[:limit]


def apply_tag_pick(text: str, token: ActiveToken, tag_key: str) -> tuple[str, int]:
    """Tab on a tag suggestion: "#do_n" + "do not trust" -> "#do_not_trust "."""
    return replace_token(text, token, "#" + tag_key.replace(" ", "_"))
