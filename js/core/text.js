// Shared text rules for names, mentions, tags and search. Pure.

// A "word character" for the @/# start rule: letters, digits, underscore (any script).
export const WORD = '[\\p{L}\\p{N}_]';
export const NOT_AFTER_WORD = `(?<!${WORD})`;
export const NOT_BEFORE_WORD = `(?!${WORD})`;

// The comparison key for names, aliases and tags: case, Unicode form,
// curly apostrophes and runs of spaces don't make two names different.
export function key(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function letterCount(s) {
  return (String(s).match(/\p{L}/gu) || []).length;
}

// Words of a name with surrounding punctuation trimmed: "(Grim)" -> "Grim".
export function nameWords(name) {
  return String(name)
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

// Spans of URLs, so "#" and "@" inside them aren't read as tags or mentions.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/giu;
export function urlSpans(text) {
  return [...String(text).matchAll(URL_RE)].map((m) => [m.index, m.index + m[0].length]);
}

export function inSpans(pos, spans) {
  return spans.some(([a, b]) => pos >= a && pos < b);
}

export function overlaps(a0, a1, spans) {
  return spans.some(([b0, b1]) => a0 < b1 && b0 < a1);
}
