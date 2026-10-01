// Display formatting: counts, dates (local time, en-AU style).

// count(1, 'note') -> "1 note"; count(2, 'entity', 'entities') -> "2 entities"
export function count(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// Hand-rolled rather than Intl: ICU versions disagree on "Sep" vs "Sept", so Node
// tests and Firefox could print different things.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

export function day(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${y}`;
}

// "26 Sep 21:40"; the year only when it isn't this year.
export function when(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${day(iso, now)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "21:40"
export function time(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Type labels are title case on their own ("Location", "NPC") and lower case inside
// sentences ("3 locations"), except acronyms (SPEC 5.3 rule 6).
export function lower(label) {
  return /^[A-Z0-9]{2,}s?$/.test(label) ? label : label.toLowerCase();
}

// "3 NPCs", "1 location", using a type's own singular and plural.
export function typeCount(n, type) {
  return `${n} ${lower(n === 1 ? type.label : type.plural)}`;
}
