"""What a recall card says (SPEC 4.5). Pure: the card widget only lays it out."""

from satchel.core.model import RecallFacts, Relation

FIRST_MENTION_AFTER = 3  # "First mention: …" only once there are more mentions than this


def card_blurb(summary: str, facts: RecallFacts, plain_first: str) -> tuple[str, str] | None:
    """The summary; or, with no summary and more than 3 mentions, the first mention
    (the last 3 are listed anyway). Returns (kind, text): kind "summary" or "first"."""
    if summary.strip():
        return ("summary", summary.strip())
    if facts.mention_count > FIRST_MENTION_AFTER and facts.first_mention:
        return ("first", plain_first)
    return None


def relation_text(rel: Relation, this_name: str, other_name: str) -> str:
    """One relationship as plain text, read from this entity's card:
    out "works for Hollow King", in "Rook owes Mira Vane", both "rival: Lord Aldric"."""
    if rel.direction == "out":
        return f"{rel.type} {other_name}"
    if rel.direction == "in":
        return f"{other_name} {rel.type} {this_name}"
    return f"{rel.type}: {other_name}"
