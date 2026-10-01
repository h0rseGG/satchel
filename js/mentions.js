// @mention parsing. Pure functions, unit tested with node --test.
//
// Typed form (what you see in the box):  @Grimbold   @Lord_Aldric
//   underscores become spaces, so @Lord_Aldric means "Lord Aldric".
// Stored form (inside note.text):         @[Grimbold](<entity-id>)
//   the label is a readable fallback; the app shows the entity's current name.

import { nameKey } from './model.js';

// A mention starts with @ at the start of the text or after a non-word
// character (so emails like a@b.com don't count). Names may contain letters,
// digits, underscores, hyphens and apostrophes.
const TYPED = /(^|[^\p{L}\p{N}_])@([\p{L}\p{N}_'’-]+)/gu;
const STORED = /@\[([^\]]*)\]\(([0-9a-f-]{36})\)/g;

// Drop a possessive and trailing joiners: "Grimbold's" -> "Grimbold",
// "Lord_Aldric_" -> "Lord_Aldric". Underscores inside are kept here.
function keptPart(raw) {
  return raw.replace(/['’]s$/u, '').replace(/[_'’-]+$/u, '');
}

// Find typed mentions. Returns [{ start, end, name }] where start/end cover
// the text to replace: the @ and the kept part of the name. Anything dropped
// (a possessive "'s") stays in the note as plain text.
export function findTyped(text) {
  const out = [];
  for (const m of text.matchAll(TYPED)) {
    const kept = keptPart(m[2]);
    const name = kept.replace(/_/g, ' ').trim();
    if (!name) continue;
    const start = m.index + m[1].length;
    out.push({ start, end: start + 1 + kept.length, name });
  }
  return out;
}

// Replace typed mentions with stored tokens.
// resolved: Map of nameKey -> { id, name }.
export function tokenise(text, resolved) {
  let out = '';
  let pos = 0;
  for (const m of findTyped(text)) {
    const ent = resolved.get(nameKey(m.name));
    if (!ent) continue;
    out += text.slice(pos, m.start) + token(ent);
    pos = m.end;
  }
  return out + text.slice(pos);
}

export function token(ent) {
  return `@[${ent.name.replace(/[[\]]/g, '')}](${ent.id})`;
}

// Entity ids referenced by stored tokens, in order, no duplicates.
export function storedIds(text) {
  return [...new Set([...text.matchAll(STORED)].map((m) => m[2]))];
}

// Split stored text into parts for display.
// [{ type: 'text', value }, { type: 'mention', id, label }]
export function parts(text) {
  const out = [];
  let pos = 0;
  for (const m of text.matchAll(STORED)) {
    if (m.index > pos) out.push({ type: 'text', value: text.slice(pos, m.index) });
    out.push({ type: 'mention', id: m[2], label: m[1] });
    pos = m.index + m[0].length;
  }
  if (pos < text.length) out.push({ type: 'text', value: text.slice(pos) });
  return out;
}

// Plain-text version (labels instead of tokens), e.g. for search indexing.
export function plain(text, nameOf = () => null) {
  return parts(text).map((p) => (p.type === 'text' ? p.value : nameOf(p.id) ?? p.label)).join('');
}

// The @token being typed right before the caret, or null.
// Returns { start, query } where query has _ -> space.
export function activeQuery(text, caret) {
  const before = text.slice(0, caret);
  const m = before.match(/(^|[^\p{L}\p{N}_])@([\p{L}\p{N}_'’-]*)$/u);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2].replace(/_/g, ' ') };
}

// How a name is written in the box: spaces become underscores.
export function typedForm(name) {
  return `@${name.replace(/\s+/g, '_')}`;
}

// Pick the entity a typed name refers to. Prefers real entities over stubs,
// then the most recently updated. `entities` must be live (not deleted).
export function matchByName(entities, name) {
  const key = nameKey(name);
  const hits = entities.filter(
    (e) => nameKey(e.name) === key || e.aliases.some((a) => nameKey(a) === key),
  );
  hits.sort((a, b) => (a.stub - b.stub) || b.updated_at.localeCompare(a.updated_at));
  return hits[0] ?? null;
}

// Autocomplete: names starting with the query first, then containing it.
export function suggest(entities, query, limit = 5) {
  const q = nameKey(query);
  const scored = [];
  for (const e of entities) {
    const keys = [e.name, ...e.aliases].map(nameKey);
    let score = null;
    if (!q) score = 2;
    else if (keys.some((k) => k.startsWith(q))) score = 0;
    else if (keys.some((k) => k.includes(q))) score = 1;
    if (score !== null) scored.push({ e, score });
  }
  scored.sort((a, b) => a.score - b.score || b.e.updated_at.localeCompare(a.e.updated_at));
  return scored.slice(0, limit).map((s) => s.e);
}
