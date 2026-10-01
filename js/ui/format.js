// Date/time display. Records store UTC; everything shown is local time, en-AU.

const timeFmt = new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function formatTime(iso) {
  return timeFmt.format(new Date(iso));
}

export function formatDay(iso) {
  return dayFmt.format(new Date(iso));
}

const shortFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' });

// "1 Oct 21:40" for compact lists.
export function formatShort(iso) {
  return `${shortFmt.format(new Date(iso))} ${formatTime(iso)}`;
}

// Local calendar day key, for grouping the feed by day.
export function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
