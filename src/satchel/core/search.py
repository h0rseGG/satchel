"""Search rules (SPEC 4.5): typo tolerance and when the capture box searches.

The database does the full-text matching (FTS5). These pure rules decide which indexed
words count as a match for each typed word.
"""

import unicodedata


def max_edits(term: str) -> int:
    """Typo tolerance by length: 0 edits up to 3 letters, 1 for 4, 2 for 5+."""
    return 0 if len(term) <= 3 else 1 if len(term) == 4 else 2


def should_search(text: str) -> bool:
    """While typing in session, only short text (1-4 words) also runs a full search."""
    return 0 < len(text.split()) <= 4


def fold(term: str) -> str:
    """Lower case without accents, roughly how FTS5's unicode61 tokenizer stores words."""
    decomposed = unicodedata.normalize("NFKD", term.lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def within_edits(a: str, b: str, limit: int) -> bool:
    """Is the Levenshtein distance between a and b at most `limit`?

    Plain Levenshtein: insert, delete or substitute one letter = 1 edit, so swapped
    letters cost 2 (as v2). Gives up as soon as a whole row exceeds the limit.
    """
    if abs(len(a) - len(b)) > limit:
        return False
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(
                min(
                    previous[j] + 1,  # delete from a
                    current[j - 1] + 1,  # insert into a
                    previous[j - 1] + (ca != cb),  # substitute (free if equal)
                )
            )
        if min(current) > limit:
            return False
        previous = current
    return previous[-1] <= limit


def fuzzy_terms(word: str, vocabulary: list[str]) -> list[str]:
    """Indexed words within the typo limit of a typed word (prefix matches are added
    separately by the query, so they aren't listed here)."""
    w = fold(word)
    limit = max_edits(w)
    if limit == 0:
        return []
    letters = set(w)
    out = []
    for t in vocabulary:
        # Cheap filters before the slow comparison. One edit changes the length by at
        # most 1 and the set of letters by at most 2 (one gone, one new), so words
        # further apart than that can't be within the limit.
        if t == w or abs(len(t) - len(w)) > limit:
            continue
        if len(letters.symmetric_difference(t)) > 2 * limit:
            continue
        if within_edits(w, t, limit):
            out.append(t)
    return out
