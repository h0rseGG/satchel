// Dates for display and for text written into records ("26 Sep: ..."). Pure.
// Hand-rolled rather than Intl: ICU versions disagree on "Sep" vs "Sept", so Node
// tests and Firefox could print different things.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const pad = (n) => String(n).padStart(2, '0');

// "26 Sep"; the year only when it isn't this year.
export function day(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${y}`;
}
