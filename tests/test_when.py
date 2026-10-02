"""core/when.py: en-AU times and dates, local to Perth in these tests."""

from datetime import timedelta, timezone

import pytest

from satchel.core.when import date_label, time_label

PERTH = timezone(timedelta(hours=8))


@pytest.mark.parametrize(
    ("iso", "label"),
    [
        ("2026-09-05T12:41:00.000Z", "8:41 pm"),
        ("2026-09-05T16:05:00.000Z", "12:05 am"),
        ("2026-09-05T04:00:00.000Z", "12:00 pm"),
        ("2026-09-04T23:30:00.000Z", "7:30 am"),
    ],
)
def test_time_label_is_local_and_lower_case(iso, label):
    assert time_label(iso, PERTH) == label


@pytest.mark.parametrize(
    ("day", "label"),
    [("2026-09-05", "Sat 5 Sept 2026"), ("2026-06-26", "Fri 26 June 2026")],
)
def test_date_label(day, label):
    assert date_label(day) == label
