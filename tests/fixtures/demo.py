"""The demo character, Wren Ashdown: a month of play typed like real table notes (SPEC 8).

Ported from v2-final:tools/demo-data.mjs. Every note goes through the real save path
(satchel.db -> core.resolve_note), so building the demo exercises the parser, auto-link
and the schema (v1 lesson 2: real-sounding data finds real bugs).

Entities, sessions and notes are replayed in time order, so a note only links to
entities that existed when it was typed. Ids come from stable keys, so every build
gives identical rows.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path

from satchel.core.model import Entity, EntityType, iso_now, stable_id
from satchel.core.text import key
from satchel.db.connection import open_db
from satchel.db.entities import (
    add_entity,
    add_field,
    add_relationship,
    add_text_file,
    add_type,
    create_character,
    set_field_value,
    set_meta,
    set_profile,
)
from satchel.db.notes import edit_form, edit_note, mark_reviewed, pin_note, save_note, start_session

PERTH = timezone(timedelta(hours=8))


def at(local: str) -> str:
    """Perth local time, written the way you'd say it -> stored UTC ISO string."""
    return iso_now(datetime.strptime(local, "%Y-%m-%d %H:%M").replace(tzinfo=PERTH))


def entity_id(k: str) -> str:
    return stable_id("pc") if k == "pc" else stable_id(f"entity:{k}")


def candidate_id(name: str) -> str:
    return stable_id(f"candidate:{key(name)}")


DEITY = EntityType(stable_id("type:deity"), "Deity", "Deities", sort_order=10)
SHIP = EntityType(stable_id("type:ship"), "Ship", "Ships", sort_order=11)
CUSTOM_TYPES = [(DEITY, "2026-09-22 18:00"), (SHIP, "2026-09-19 21:30")]
TYPE_IDS = {"type-deity": DEITY.id, "type-ship": SHIP.id}

# key, name, type, created (Perth), extra
ENTITIES = [
    ("kael", "Kael Brightwater", "type-character", "2026-09-05 19:30", {"summary": "Our bard. Charms anything with a pulse."}),
    ("oswin", "Brother Oswin", "type-character", "2026-09-05 19:30", {"summary": "Cleric. Hates boats."}),
    ("bess", "Old Bess", "type-npc", "2026-09-05 19:45", {"summary": "Runs the Drowned Lantern. Cheap ale, good stew."}),
    ("aldric", "Lord Aldric Thorne", "type-npc", "2026-09-05 20:05", {"summary": "Owns the mill. Hired us. Lying through his teeth.", "tags": ("noble", "fuck this guy", "liar")}),
    ("grimbold", "Grimbold Ironhand", "type-npc", "2026-09-05 20:20", {"summary": "Dwarf smith and moneylender. 10% a week.", "body": "Forge is next to the mill; hates the night noise too."}),
    ("caldra", "Sister Caldra", "type-npc", "2026-09-06 11:10", {"summary": "Temple healer. Knew mum."}),
    ("morwen", "Sister Morwen", "type-npc", "2026-09-12 19:40", {"summary": "Also at the temple. Rude."}),
    ("lyra", "Lyra Ashdown", "type-npc", "2026-09-05 21:50", {"summary": "My sister. Missing 3 years.", "tags": ("family",)}),
    ("mira", "Mira Vane", "type-npc", "2026-09-19 20:10", {"summary": "Fence. Sold us the barrow map. Knew mum??", "aliases": ("The Fox",), "tags": ("fence", "do NOT trust")}),
    ("rook", "Captain Rook Harlow", "type-npc", "2026-09-19 21:30", {"summary": "Captain of the Gull’s Wake. Owes Mira a favour."}),
    ("millbrook", "Millbrook", "type-location", "2026-09-05 19:35", {"summary": "Rainy mill town. Where it started."}),
    ("lantern", "The Drowned Lantern", "type-location", "2026-09-05 19:45", {"summary": "The inn."}),
    ("mill", "Thorne Mill", "type-location", "2026-09-05 20:05", {"summary": "Runs at night. Nobody sees workers."}),
    ("saltmarsh", "Saltmarsh", "type-location", "2026-09-06 11:00", {"summary": "Where Lyra was last seen."}),
    ("barrow", "Hollow Barrow", "type-location", "2026-09-19 20:30", {"summary": "Two days north. On Mira’s map."}),
    ("locket", "Lyra’s Locket", "type-item", "2026-09-05 21:50", {"summary": "Dropped by someone fleeing the mill."}),
    ("auril", "Auril", "type-deity", "2026-09-22 18:00", {"aliases": ("The Frostmaiden",)}),
    ("gull", "The Gull’s Wake", "type-ship", "2026-09-19 21:30", {}),
]  # fmt: skip

# when (Perth), in session?, text as typed, options: inbox (unreviewed), pin [keys], edit
NOTES = [
    ("2026-09-05 19:40", True, "ok session 1. we're in @Millbrook, rainy af 🌧️", {}),
    ("2026-09-05 19:46", True, "inn = @The_Drowned_Lantern, run by @Old_Bess. cheap ale, good stew", {}),
    ("2026-09-05 19:55", True, "bess says the mill's been running at night. noone sees workers", {}),
    ("2026-09-05 20:06", True, '@Lord_Aldric_Thorne owns the mill. hired us 50gp to "investigate the noises" lol ok', {}),
    ("2026-09-05 20:11", True, "aldric's got rings on every finger. smug. #do_NOT_trust", {}),
    ("2026-09-05 20:14", True, 'kael rolled a nat 1 on persuasion and called him "my lord daddy" 💀', {}),
    ("2026-09-05 20:21", True, "need money for gear. @Grimbold lends at 10% a WEEK?? highway robbery. took 20gp #debts", {}),
    ("2026-09-05 20:25", True, "grimbold's forge is next to the mill, he hates the noise too", {"pin": ["grimbold"]}),
    ("2026-09-05 20:40", True, "brb pizza", {}),
    ("2026-09-05 21:30", True, "mill at night: crates marked w/ a crown symbol. upside down #clue", {}),
    ("2026-09-05 21:52", True, "someone fled N into the marsh, dropped a locket. it's @Lyra’s. HOW??? #lyra", {}),
    ("2026-09-05 22:55", True, "end. 300xp. kael owes everyone a drink", {}),
    ("2026-09-06 11:05", False, 'lyra went missing 3 yrs ago from @Saltmarsh. last letter said something about "the hollow" #lyra', {}),
    ("2026-09-06 11:12", False, "ask @Sister_Caldra at the temple about the locket — she knew mum", {}),

    ("2026-09-12 19:42", True, "temple. @caldra is lovely. @Sister_Morwen is NOT, rude af", {}),
    ("2026-09-12 19:58", True, "caldra: crown symbol = the hollow king. old smuggler legend #clue", {}),
    ("2026-09-12 20:03", True, "@Hollow_King running cargo thru the mill? aldric must know", {}),
    ("2026-09-12 20:20", True, "kael fell asleep irl lmao", {}),
    ("2026-09-12 20:31", True, "met a kid @Pip who sells info for sweets 🍬", {}),
    ("2026-09-12 20:36", True, "pip says boats come in at the old jetty on new moons", {}),
    ("2026-09-12 20:50", True, "@Grimbol wants first payment already. 5gp. #debts", {"inbox": True}),
    ("2026-09-12 21:15", True, "FIGHT at the jetty!! 4 thugs. oswin nearly died 😬", {}),
    ("2026-09-12 21:40", True, "thug had a tattoo, crown upside down. same as the crates", {}),
    ("2026-09-12 21:44", True, "they called their boss @Vex. not the hollow king? lieutenant?", {}),
    ("2026-09-12 22:10", True, "loot: 30gp, a ledger in code, nice dagger #loot", {}),
    ("2026-09-13 10:30", False, "ledger: dates match new moons. initials A.T. on half the entries 👀 #clue", {"inbox": True}),

    ("2026-09-19 19:45", True, "back to the mill. aldric pretends nothing happened. lying thru his teeth #fuck_this_guy", {}),
    ("2026-09-19 19:52", True, '@Aldric says lyra is "a name he doesnt know". LIAR. he flinched', {"edit": ("2026-09-20 09:15", " (he knew @Lyra by name in the ledger)")}),
    ("2026-09-19 20:11", True, "@Mira_Vane shows up. fence. sells us a map of the barrow for 40gp", {}),
    ("2026-09-19 20:15", True, "mira knew mum?? says she'll explain later. wtf", {}),
    ("2026-09-19 20:31", True, "@Hollow_Barrow is 2 days north #lyra", {}),
    ("2026-09-19 20:48", True, "paid grimbold 5gp #debts", {}),
    ("2026-09-19 21:05", True, 'caught one of the thugs. they move "cargo" for someone called the @Hollow_King', {}),
    ("2026-09-19 21:07", True, "cargo = people?? 😡", {}),
    ("2026-09-19 21:20", True, "@The_Fox is mira's street name apparently", {}),
    ("2026-09-19 21:32", True, "the boat at the jetty is @The_Gull’s_Wake. capt @Rook", {}),
    ("2026-09-22 18:05", False, "@Auril? the frostmaiden. mira said the hollow king's men pray to her. look up", {}),

    ("2026-09-26 19:40", True, "paid @Grimbold back the 20gp, ledger squared #debts", {"inbox": True}),
    ("2026-09-26 20:45", True, "@Mira’s back. says she knew mum and that @Lyra is ALIVE #lyra", {"inbox": True}),
    ("2026-09-26 20:52", True, "lyra is on the gull's wake?? sails in 3 days", {"inbox": True}),
    ("2026-09-26 21:01", True, "rook owes mira a favour. she can get us aboard", {"inbox": True}),
    ("2026-09-26 21:20", True, "aldric sent guards after us. 3 of them. kael charmed one, fuck yeah", {"inbox": True}),
    ("2026-09-26 21:34", True, "vex is aldric's SISTER?!?!", {"inbox": True}),
    ("2026-09-26 21:50", True, 'found a note: "the King sails with the cold moon" #clue', {"inbox": True}),
    ("2026-09-26 22:05", True, 'oswin: "i didnt sign up for boats"', {"inbox": True}),
    ("2026-09-26 22:40", True, "next sess: board the ship, find lyra. DONT TRUST ALDRIC #do_NOT_trust", {"inbox": True}),
    ("2026-09-27 09:30", False, "idea: ask bess for disguises before the docks", {"inbox": True}),
]  # fmt: skip

# from, to, type, directed. "candidate:<name>" points at a candidate made by a note.
RELATIONSHIPS = [
    ("pc", "lyra", "family", False),
    ("pc", "grimbold", "owes", True),
    ("aldric", "candidate:Hollow King", "works for", True),
    ("aldric", "grimbold", "rival", False),
    ("mill", "millbrook", "located in", True),
    ("lantern", "millbrook", "located in", True),
    ("mira", "pc", "ally", False),
    ("candidate:Vex", "aldric", "family", False),
    ("rook", "mira", "owes", True),
]

SONG = """Song of the Drowned Lantern
(Bess sings it when the rain comes in)

The lamp went down with the miller's boat,
the lamp went down with the light;
and every year when the river's high
it burns beneath at night.

So drink your ale and mind the stair
and don't go out alone;
the mill wheel turns when no one's there
and something calls it home.
"""

PROFILE = {
    "concept": "Exiled ranger looking for her missing sister",
    "backstory": 'Grew up in Saltmarsh. Left after a falling-out with the ranger lodge. Lyra vanished three years ago; her last letter mentioned "the hollow".',
    "personality": "Quiet, watchful, swears a lot when nervous.",
    "ideals": "Family first. Promises are kept.",
    "bonds": "Lyra. Mum's old friends, whoever they turn out to be.",
    "flaws": "Trusts nobody with a title.",
    "goals": "Find Lyra. Pay off Grimbold. Burn the mill down, maybe.",
    "appearance": "Tall, freckled, green cloak patched at the elbows.",
    "notes": """This is a test character for trying Satchel. Change anything; nothing here is real.

Things to poke at:
- Review has unreviewed notes from session 4 (and two older strays).
- "Grimbol" is a typo candidate for Grimbold Ironhand. Merge it into him.
- Hollow King, Pip and Vex are candidates with no type yet. Give them one.
- Deity and Ship are custom types; a ship's Captain is a link field.
- One note was edited after the session; its first version is kept.
- Names link themselves: "aldric", "the fox", "pip" were typed without @.
- Search with a typo: "grimbld", "lantren".
- Tags: #debts, #do_NOT_trust, #fuck_this_guy.""",
}  # fmt: skip


def _ref(k: str) -> str:
    return candidate_id(k.split(":", 1)[1]) if k.startswith("candidate:") else entity_id(k)


def build_demo(path: Path) -> Path:
    """Build the demo character file at `path` (which must not exist yet)."""
    conn = open_db(path)
    create_character(
        conn,
        "Wren Ashdown",
        character_id=stable_id("character"),
        pc_entity_id=entity_id("pc"),
        now=at("2026-09-05 19:00"),
    )
    set_meta(conn, "dndbeyond_url", "https://www.dndbeyond.com/characters")
    for section, text in PROFILE.items():
        set_profile(conn, section, text, at("2026-09-06 10:00"))

    # One timeline: (time, order at the same minute, action). Types before sessions
    # before entities before notes, so a 21:30 ship type exists for a 21:30 ship.
    events = []
    for t, created in CUSTOM_TYPES:
        events.append((at(created), 0, lambda t=t, c=created: add_type(conn, t, at(c))))
    session_dates = sorted({when[:10] for when, in_session, _, _ in NOTES if in_session})
    session_ids = {d: stable_id(f"session:{d}") for d in session_dates}
    for d in session_dates:
        first = min(when for when, in_session, _, _ in NOTES if in_session and when[:10] == d)
        events.append(
            (
                at(first),
                1,
                lambda d=d, f=first: start_session(conn, d, at(f), session_id=session_ids[d]),
            )
        )
    for k, name, type_key, created, extra in ENTITIES:
        e = Entity(
            id=entity_id(k),
            name=name,
            type_id=TYPE_IDS.get(type_key, type_key),
            created_at=at(created),
            updated_at=at(created),
            **extra,
        )
        events.append((at(created), 2, lambda e=e: add_entity(conn, e)))
    for when, in_session, text, opts in NOTES:
        sid = session_ids[when[:10]] if in_session else None
        nid = stable_id(f"note:{when}")
        events.append(
            (
                at(when),
                3,
                lambda text=text, when=when, sid=sid, nid=nid: save_note(
                    conn,
                    text,
                    now=at(when),
                    session_id=sid,
                    note_id=nid,
                    new_candidate_id=candidate_id,
                ),
            )
        )
        if "edit" in opts:
            edit_when, appended = opts["edit"]
            events.append(
                (
                    at(edit_when),
                    4,
                    lambda nid=nid, ew=edit_when, a=appended: _edit(conn, nid, a, at(ew)),
                )
            )
    events.sort(key=lambda ev: (ev[0], ev[1]))
    for _, _, action in events:
        action()

    # Afterwards: types' fields and values, pins, relationships, the song, review state.
    add_field(conn, "f-domain", DEITY.id, "Domain", "text")
    add_field(conn, "f-captain", SHIP.id, "Captain", "link", link_type="type-npc")
    set_field_value(conn, entity_id("auril"), "f-domain", "Winter")
    set_field_value(conn, entity_id("gull"), "f-captain", entity_id("rook"))
    for when, _, _, opts in NOTES:
        for k in opts.get("pin", []):
            pin_note(conn, entity_id(k), stable_id(f"note:{when}"), at(when))
        if not opts.get("inbox"):
            mark_reviewed(conn, stable_id(f"note:{when}"), at(when[:10] + " 23:30"))
    for frm, to, rel_type, directed in RELATIONSHIPS:
        add_relationship(
            conn,
            stable_id(f"rel:{frm}:{to}:{rel_type}"),
            _ref(frm),
            _ref(to),
            rel_type,
            directed=directed,
            now=at("2026-09-20 10:00"),
        )
    add_text_file(
        conn,
        stable_id("file:song"),
        "Song of the Drowned Lantern.md",
        SONG.encode(),
        mime="text/markdown",
        now=at("2026-09-06 11:30"),
        entity_id=entity_id("lantern"),
        caption="Bess's song",
    )
    conn.close()
    return path


def _edit(conn, note_id: str, appended: str, now: str) -> None:
    """Edited the way the app does it: the edit form with its picks, plus new text."""
    form, picks = edit_form(conn, note_id)
    edit_note(conn, note_id, form + appended, now=now, picks=picks, new_candidate_id=candidate_id)
