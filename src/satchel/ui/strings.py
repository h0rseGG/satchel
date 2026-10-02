"""Every word the user sees (SPEC 5.3: one file). Plain where clarity matters, the
field-journal voice only at signature moments."""

APP_NAME = "Satchel"

# --- Buttons and menus ----------------------------------------------------------------
START_SESSION = "Start session"
END_SESSION = "End session"
PACK_KIT = "Pack kit"
UNPACK_KIT = "Unpack kit"
NOT_NOW = "Not now"
NEW_CHARACTER = "New character"
OPEN_CHARACTER = "Open character"
OPEN_SATCHEL = "Open Satchel"
QUICK_CAPTURE = "Quick capture"
QUIT = "Quit"
CANCEL = "Cancel"
REPLACE = "Replace"
ADD_AS_NEW = "Add as new character"

# --- Signature moments (SPEC 5.3) ---------------------------------------------------------
KIT_PACKED = "Kit packed: {file_name}"
EMPTY_NOTES = "Your satchel is light. Type below and press Enter."
REVIEW_EMPTY = "Nothing loose. Every page is filed."
EMPTY_FILES = "No maps or scraps yet."
END_OF_SESSION_NUDGE = "Session over. Pack your kit before you go?"

# --- Sessions -------------------------------------------------------------------------------
SESSION_HEADING = "Session {number}"
BETWEEN_SESSIONS = "Between sessions"

# --- Messages --------------------------------------------------------------------------------
ALREADY_RUNNING = "Satchel is already open."
HOTKEY_TAKEN = "The quick capture key {hotkey} is used by another app. Quick capture is off."
REPLACE_NEWER_WARNING = (
    "This computer's copy has changes made after the kit was packed. "
    "Replace keeps it in the replaced folder, but you'll be working from the kit."
)

# Why a kit can't be unpacked, by KitError.code (core/kit.py). A test checks every code
# has words here.
KIT_ERRORS = {
    "not_zip": "That file isn't a kit.",
    "no_manifest": "That file isn't a Satchel kit (no manifest).",
    "bad_manifest": "This kit's manifest can't be read.",
    "not_satchel": "That kit wasn't made by Satchel.",
    "no_database": "This kit has no character in it.",
    "corrupt": "This kit is damaged and can't be used.",
    "too_new": "This kit was made by a newer Satchel. Update Satchel first.",
    "mismatch": "This kit's manifest doesn't match the character inside it.",
    "not_same_character": "Replace only works with a kit of the same character.",
}


def count(n: int, singular: str, plural: str | None = None) -> str:
    """ "1 note", "2 notes" (SPEC 5.2.6)."""
    return f"{n} {singular if n == 1 else (plural or singular + 's')}"
