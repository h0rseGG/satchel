// @mention parsing. Pure functions, unit tested with node --test.
//
// Typed form (what you see in the box):  @Grimbold   @Lord_Aldric
//   underscores become spaces, so @Lord_Aldric means "Lord Aldric".
// Stored form (inside note.text):         @[Grimbold](<entity-id>)
//   the label is a readable fallback; the app shows the entity's current name.

import { cleanName, makeEntity, nameKey } from './model.js';

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

// Turn typed mentions into stored tokens. Each name resolves to: the
// autocomplete pick, else an exact name/alias match, else a new stub.
// Pure: new stubs are returned in `created` for the caller to save.
// entities: live entities. picked: { [nameKey]: entityId }.
export function resolveMentions(text, entities, picked = {}) {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const pool = [...entities];
  // Unique first names ("@Grimbold" for Grimbold Ironhand) before making a stub.
  const byShort = new Map([...shortNames(entities)].flatMap(([id, words]) => words.map((w) => [nameKey(w), byId.get(id)])));
  const resolved = new Map();
  const created = [];
  for (const m of findTyped(text)) {
    const key = nameKey(m.name);
    if (resolved.has(key)) continue;
    let ent = byId.get(picked[key]) ?? matchByName(pool, m.name) ?? byShort.get(key);
    if (!ent) {
      ent = makeEntity({ name: m.name });
      pool.push(ent);
      created.push(ent);
    }
    resolved.set(key, ent);
  }
  const stored = tokenise(text, resolved);
  return { text: stored, mentions: storedIds(stored), created };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The short names people use at the table: "Grimbold" for Grimbold Ironhand,
// "Caldra" for Sister Caldra, "Aldric" for Lord Aldric Thorne. For people
// only (NPCs, characters, and stubs, which are usually people), any word of
// a two-plus-word name counts if it's 4+ letters and belongs to no other
// entity (not part of another name, not another's name or alias). So
// "Ashdown" (Wren and Lyra) never matches. Places, factions and items get
// aliases instead: their words ("Order", "Watch") are everyday words.
// Returns Map of entity id -> [words].
const PEOPLE = new Set(['npc', 'character', 'unknown']);
export function shortNames(entities) {
  const owners = new Map();   // word key -> entity, or null if shared
  const claim = (k, e) => owners.set(k, owners.has(k) && owners.get(k) !== e ? null : e);
  const full = new Map();     // full name/alias key -> entity
  for (const e of entities) {
    for (const n of [e.name, ...(e.aliases ?? [])]) full.set(nameKey(n), e);
    for (const w of cleanName(e.name).split(' ')) claim(nameKey(w), e);
  }
  const out = new Map();
  for (const e of entities) {
    const words = cleanName(e.name).split(' ');
    if (!PEOPLE.has(e.type) || words.length < 2) continue;
    const mine = words.filter((w) => {
      const k = nameKey(w);
      return w.length >= 4 && owners.get(k) === e && (!full.has(k) || full.get(k) === e);
    });
    if (mine.length) out.set(e.id, mine);
  }
  return out;
}

// Turn the last plain (un-@'d) occurrence of an entity's name or alias in
// the box into its typed mention: "found the sunblade" -> "found the @Sunblade".
// `extra`: other names to look for (e.g. its short first name).
// Returns { text, start, removed, inserted } or null if there's nothing to link.
export function linkPlainName(text, entity, extra = []) {
  let best = null;
  for (const n of [entity.name, ...entity.aliases, ...extra]) {
    const clean = cleanName(n);
    if (!clean) continue;
    const pattern = clean.split(' ').map(escapeRe).join('\\s+');
    // Not already part of a mention (@Name or the _Aldric in @Lord_Aldric).
    const re = new RegExp(`(?<![\\p{L}\\p{N}_@])${pattern}(?![\\p{L}\\p{N}_])`, 'giu');
    for (const m of text.matchAll(re)) {
      // The occurrence that ends last; if several end there, the longest, so
      // "lord aldric" beats the short name "aldric" inside it.
      const end = m.index + m[0].length;
      const bestEnd = best && best.start + best.removed;
      if (!best || end > bestEnd || (end === bestEnd && m[0].length > best.removed)) {
        best = { start: m.index, removed: m[0].length };
      }
    }
  }
  if (!best) return null;
  const insert = typedForm(entity.name);
  return {
    text: text.slice(0, best.start) + insert + text.slice(best.start + best.removed),
    start: best.start,
    removed: best.removed,
    inserted: insert.length,
  };
}

// Stored text -> what you see when editing a note: tokens of live entities
// become their typed form (@Grimbold, @Lord_Aldric), remembered in `picked`
// so saving links the same entities again. Tokens for entities that are
// gone (not in `names`) are left as stored, so an edit can't turn them into
// new stubs. names: Map of live entity id -> current name.
export function toTypedForEdit(text, names) {
  const picked = {};
  const typed = text.replace(STORED, (whole, label, id) => {
    const name = names.get(id);
    if (!name) return whole;
    picked[nameKey(name)] = id;
    return typedForm(name);
  });
  return { text: typed, picked };
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
