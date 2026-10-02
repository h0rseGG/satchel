"""How stored note text is shown: mention labels, chips and plain text (SPEC 4.1)."""

from dataclasses import dataclass

from satchel.core.mentions import find_stored
from satchel.core.model import Entity
from satchel.core.tags import find_tags
from satchel.core.text import key


def display_label(label: str, entity: Entity) -> str:
    """What a mention shows: what was typed while it's still one of the entity's names
    ("Grimbold" for Grimbold Ironhand, "The Fox" for Mira Vane), spelled the entity's
    way; otherwise the current name, so a rename flows through."""
    k = key(label)
    if not k:
        return entity.name
    for n in (entity.name, *entity.aliases):
        if key(n) == k:
            return n
    words = entity.name.split()
    want = len(k.split(" "))
    for i in range(len(words) - want + 1):
        run = " ".join(words[i : i + want])
        if key(run) == k:
            return run
    return entity.name


@dataclass(frozen=True)
class Segment:
    """A piece of note text for rendering: kind is "text", "mention" or "tag"."""

    kind: str
    text: str
    id: str | None = None  # mentions only
    missing: bool = False  # mention whose entity is gone (dashed chip)
    key: str | None = None  # tags only


def segments(stored_text: str, by_id: dict[str, Entity]) -> list[Segment]:
    marks: list[tuple[int, int, Segment]] = []
    for s in find_stored(stored_text):
        e = by_id.get(s.id)
        label = display_label(s.label, e) if e else s.label
        marks.append((s.start, s.end, Segment("mention", label, id=s.id, missing=e is None)))
    for t in find_tags(stored_text):
        marks.append((t.start, t.end, Segment("tag", stored_text[t.start : t.end], key=t.key)))
    marks.sort(key=lambda m: m[0])
    out: list[Segment] = []
    pos = 0
    for start, end, seg in marks:
        if start < pos:
            continue
        if start > pos:
            out.append(Segment("text", stored_text[pos:start]))
        out.append(seg)
        pos = end
    if pos < len(stored_text):
        out.append(Segment("text", stored_text[pos:]))
    return out


def plain_text(stored_text: str, by_id: dict[str, Entity]) -> str:
    """Stored text with mentions as display labels: for search and plain display."""
    return "".join(s.text for s in segments(stored_text, by_id))


def search_text(stored_text: str, by_id: dict[str, Entity]) -> str:
    """Plain text for the search index. A mention is indexed as shown ("Mira") and by the
    entity's full name ("Mira Vane"), so searching either finds the note (v2)."""
    parts = []
    for seg in segments(stored_text, by_id):
        entity = by_id.get(seg.id) if seg.kind == "mention" else None
        if entity and entity.name != seg.text:
            parts.append(f"{seg.text} {entity.name}")
        else:
            parts.append(seg.text)
    return "".join(parts)
