"""Record shapes the core rules work on (SPEC 3).

These are plain dataclasses, not database rows: `satchel.db` builds them from SQLite
and the core never knows where they came from. Only the fields the rules need are here.
"""

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

# Note link kinds (SPEC 4.6.6). Higher wins when one entity is linked several ways.
HOW_AUTO = "auto"
HOW_TYPED = "typed"
HOW_CONFIRMED = "confirmed"
HOW_RANK = {HOW_AUTO: 0, HOW_TYPED: 1, HOW_CONFIRMED: 2}

PROFILE_SECTIONS = (
    "concept",
    "backstory",
    "personality",
    "ideals",
    "bonds",
    "flaws",
    "goals",
    "appearance",
    "notes",
)


@dataclass(frozen=True)
class EntityType:
    id: str
    label: str
    plural: str
    person: bool = False
    builtin: bool = False
    sort_order: int = 0


# Fixed ids so every character file agrees on the built-ins.
BUILTIN_TYPES = (
    EntityType("type-npc", "NPC", "NPCs", person=True, builtin=True, sort_order=0),
    EntityType("type-location", "Location", "Locations", builtin=True, sort_order=1),
    EntityType("type-faction", "Faction", "Factions", builtin=True, sort_order=2),
    EntityType("type-item", "Item", "Items", builtin=True, sort_order=3),
    EntityType(
        "type-character", "Character", "Characters", person=True, builtin=True, sort_order=4
    ),
    EntityType("type-thread", "Thread", "Threads", builtin=True, sort_order=5),
    EntityType("type-other", "Other", "Other", builtin=True, sort_order=6),
)


@dataclass(frozen=True)
class Entity:
    id: str
    name: str
    type_id: str | None = "type-npc"
    aliases: tuple[str, ...] = ()
    is_candidate: bool = False
    updated_at: str = ""
    created_at: str = ""
    summary: str = ""
    body: str = ""
    tags: tuple[str, ...] = field(default=())
    thread_state: str | None = None


def is_person(entity: Entity, types_by_id: dict[str, EntityType]) -> bool:
    """People get short names. Candidates have no type yet and count as people:
    most are names overheard at the table."""
    if entity.type_id is None:
        return entity.is_candidate
    t = types_by_id.get(entity.type_id)
    return bool(t and t.person)


def new_id() -> str:
    return str(uuid.uuid4())


def stable_id(seed: str, namespace: str = "satchel-demo") -> str:
    """A UUID-shaped id derived from a key, so rebuilding the demo gives the same ids (v2)."""
    h = hashlib.sha256(f"{namespace}:{seed}".encode()).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-5{h[13:16]}-a{h[17:20]}-{h[20:32]}"


def iso_now(now: datetime | None = None) -> str:
    """ISO 8601 UTC with milliseconds and a Z, as stored: 2026-09-05T11:40:00.000Z."""
    now = (now or datetime.now(UTC)).astimezone(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
