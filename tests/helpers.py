"""Small builders for core tests (v2 tests/unit/helpers.js)."""

import itertools
import re

from satchel.core.model import BUILTIN_TYPES, Entity

T0 = "2026-09-01T10:00:00.000Z"
TYPES_BY_ID = {t.id: t for t in BUILTIN_TYPES}

_counter = itertools.count(1)


def ent(name: str, **extra) -> Entity:
    """An NPC unless told otherwise, with a readable unique id."""
    n = next(_counter)
    slug = re.sub(r"\W+", "", name).lower()
    fields = {"id": f"e{n}-{slug}", "type_id": "type-npc", "updated_at": T0, **extra}
    if "aliases" in fields:
        fields["aliases"] = tuple(fields["aliases"])
    return Entity(name=name, **fields)


def candidate(name: str, **extra) -> Entity:
    return ent(name, type_id=None, is_candidate=True, **extra)
