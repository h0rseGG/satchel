// Note tags: "#tag", "#two_words" (SPEC 4.4). Pure.
import { NOT_AFTER_WORD, key, urlSpans, inSpans } from './text.js';

// Same start rule as @mentions. Tags must start with a letter so "#1" and "#3pm" stay text.
// Internal ' ’ - _ are allowed; trailing ones are dropped, as is a possessive "'s".
const TAG_RE = new RegExp(`${NOT_AFTER_WORD}#(\\p{L}[\\p{L}\\p{N}_'’\\-]*)`, 'gu');
const STORED_MENTION_RE = /@\[[^\]]*\]\([^)\s]+\)/g;

export function trimToken(raw) {
  let s = raw;
  for (;;) {
    const next = s.replace(/[_\-'’]+$/u, '').replace(/['’][sS]$/u, '');
    if (next === s) return s;
    s = next;
  }
}

export function tagKey(raw) {
  return key(raw.replace(/_+/g, ' '));
}

// Spans to skip: URLs and stored mention tokens (a "#" inside a label isn't a tag).
function skipSpans(text) {
  const spans = urlSpans(text);
  for (const m of text.matchAll(STORED_MENTION_RE)) spans.push([m.index, m.index + m[0].length]);
  return spans;
}

// Every #tag in the text: { start, end, raw, key }. `end` excludes dropped trailing characters.
export function findTags(text) {
  const t = String(text ?? '');
  const skip = skipSpans(t);
  const out = [];
  for (const m of t.matchAll(TAG_RE)) {
    if (inSpans(m.index, skip)) continue;
    const raw = trimToken(m[1]);
    if (!raw) continue;
    out.push({ start: m.index, end: m.index + 1 + raw.length, raw, key: tagKey(raw) });
  }
  return out;
}

// Derived note.tags: unique lower-case keys in order of first appearance.
export function tagKeys(text) {
  return [...new Set(findTags(text).map((t) => t.key))];
}

export function tagCounts(notes) {
  const counts = new Map();
  for (const n of notes) {
    if (n.deleted) continue;
    for (const k of n.tags || []) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

// Capture-box suggestions: prefix matches, then substring matches, most used first.
export function suggestTags(query, counts, limit = 5) {
  const q = tagKey(query);
  const rank = (k) => (k.startsWith(q) ? 0 : k.includes(q) ? 1 : 2);
  return [...counts.entries()]
    .filter(([k]) => rank(k) < 2)
    .sort(([a, ca], [b, cb]) => rank(a) - rank(b) || cb - ca || a.localeCompare(b))
    .slice(0, limit)
    .map(([k, count]) => ({ key: k, count }));
}

// How a picked tag is typed back into the box.
export function typedTag(k) {
  return `#${k.replace(/ /g, '_')}`;
}
