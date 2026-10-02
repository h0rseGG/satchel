"""Shared text helpers (SPEC 4)."""

from satchel.core.text import key, letter_count, name_words, overlaps, trim_token, url_spans


def test_key_ignores_case_form_apostrophes_and_spaces():
    assert key("  Lyra’s   Locket ") == "lyra's locket"
    assert key("Zoë") == key("Zoë")  # NFD vs NFC
    assert key(None) == ""


def test_letter_count():
    assert letter_count("Old") == 3
    assert letter_count("O'Brien") == 6


def test_name_words_trim_punctuation():
    assert name_words("(Grim) St. Cuthbert") == ["Grim", "St", "Cuthbert"]
    assert name_words("Lyra’s Locket") == ["Lyra’s", "Locket"]


def test_trim_token():
    assert trim_token("Aldric_-") == "Aldric"
    assert trim_token("Mira’s") == "Mira"
    assert trim_token("Mira's_") == "Mira"


def test_url_spans_and_overlaps():
    spans = url_spans("go to https://x.com/a#b now")
    assert spans == [(6, 23)]
    assert overlaps(22, 25, spans)
    assert not overlaps(23, 25, spans)
