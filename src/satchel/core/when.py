"""Times and dates as Jake reads them (SPEC 3: stored UTC, shown local, en-AU).

Written out by hand rather than with strftime's %p and %b, which follow the Windows
locale and would give "PM" or "Sep". en-AU writes "8:41 pm" and "Sept".
"""

from datetime import date, datetime, tzinfo

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec")
_DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def parse_utc(iso: str) -> datetime:
    """A stored time ("2026-09-05T11:40:00.000Z") as an aware datetime."""
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def time_label(iso: str, tz: tzinfo | None = None) -> str:
    """ "8:41 pm" in local time (tz None = this computer's zone)."""
    t = parse_utc(iso).astimezone(tz)
    hour = t.hour % 12 or 12
    return f"{hour}:{t.minute:02d} {'am' if t.hour < 12 else 'pm'}"


def day_label(iso: str, tz: tzinfo | None = None) -> str:
    """A stored time's local day, short: "5 Sept" (recall card mentions)."""
    d = parse_utc(iso).astimezone(tz).date()
    return f"{d.day} {_MONTHS[d.month - 1]}"


def date_label(day: str) -> str:
    """A local date ("2026-09-05") as "Fri 5 Sept 2026"."""
    d = date.fromisoformat(day)
    return f"{_DAYS[d.weekday()]} {d.day} {_MONTHS[d.month - 1]} {d.year}"
