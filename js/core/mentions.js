// @mentions: parsing, resolution, editing and display (SPEC 4.1, 4.2). Pure.
import { NOT_AFTER_WORD, key, urlSpans, inSpans, overlaps } from './text.js';
import { makeRecord, isLive, resolveMerged } from './model.js';
import { trimToken, findTags } from './tags.js';
import { shortNames } from './shortnames.js';

// Typed form. Starts with a letter (so "@5pm" stays text) and only at the start
// of the text or after a non-word character (so emails don't trigger it).
const TYPED_RE = new RegExp(`${NOT_AFTER_WORD}@(\\p{L}[\\p{L}\\p{N}_'’\\-]*)`, 'gu');
const STORED_RE = /@\[([^\]]*)\]\(([^)\s]+)\)/g;
const TOKEN_CHAR = /[\p{L}\p{N}_'’-]/u;

export const typedName = (raw) => raw.replace(/_+/g, ' ').trim();
const cleanLabel = (s) => String(s).replace(/[[\]]/g, '').trim();
export const storedToken = (label, id) => `@[${cleanLabel(label)}](${id})`;

export function findStored(text) {
  return [...String(text ?? '').matchAll(STORED_RE)].map((m) => ({ start: m.index, end: m.index + m[0].length, label: m[1], id: m[2] }));
}

// Typed @tokens outside URLs and stored tokens: { start, end, raw, name }.
export function findTyped(text) {
  const t = String(text ?? '');
  const skip = [...urlSpans(t), ...findStored(t).map((s) => [s.start, s.end])];
  const out = [];
  for (const m of t.matchAll(TYPED_RE)) {
    if (inSpans(m.index, skip)) continue;
    const raw = trimToken(m[1]);
    if (!raw) continue;
    out.push({ start: m.index, end: m.index + 1 + raw.length, raw, name: typedName(raw) });
  }
  return out;
}

export function mentionIds(storedText) {
  return [...new Set(findStored(storedText).map((s) => s.id))];
}

// --- Name index -----------------------------------------------------------

// Built once per save or keystroke: exact names/aliases and short names of live entities.
export function buildNameIndex(entities, typesById) {
  const live = entities.filter(isLive);
  const exact = new Map();
  for (const e of live) {
    for (const n of [e.name, ...(e.aliases || [])]) {
      const k = key(n);
      if (!k) continue;
      if (!exact.has(k)) exact.set(k, []);
      if (!exact.get(k).includes(e)) exact.get(k).push(e);
    }
  }
  for (const list of exact.values()) list.sort(preferred);
  return { live, byId: new Map(entities.map((e) => [e.id, e])), exact, short: shortNames(live, typesById) };
}

// Several exact matches: a real entity beats a stub, then the most recently edited.
function preferred(a, b) {
  return (a.stub ? 1 : 0) - (b.stub ? 1 : 0) || cmp(b.updated_at, a.updated_at) || cmp(a.id, b.id);
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function lookupName(name, index) {
  const k = key(name);
  return index.exact.get(k)?.[0] ?? index.short.get(k) ?? null;
}

// --- Resolution on save ---------------------------------------------------

// Turns typed @tokens into stored tokens. Order: the autocomplete pick, exact name
// or alias, short name, else a new stub (one per name per save).
// picks: [{ name, id }] recorded by the capture box when the user chose an entity.
export function resolveText(text, index, { picks = [], now, stubId } = {}) {
  const tokens = findTyped(text);
  const stubs = [];
  const newByKey = new Map();
  let out = '';
  let pos = 0;
  for (const tok of tokens) {
    const k = key(tok.name);
    const pick = picks.find((p) => key(p.name) === k && isLive(index.byId.get(p.id)));
    let entity = pick ? index.byId.get(pick.id) : lookupName(tok.name, index) ?? newByKey.get(k);
    if (!entity) {
      entity = makeRecord('entities', { name: tok.name, stub: true, type_id: null }, { now, ...(stubId ? { id: stubId(tok.name) } : {}) });
      stubs.push(entity);
      newByKey.set(k, entity);
    }
    out += text.slice(pos, tok.start) + storedToken(tok.name, entity.id);
    pos = tok.end;
  }
  out += text.slice(pos);
  return { text: out, mentions: mentionIds(out), stubs };
}

// --- Editing --------------------------------------------------------------

// How an entity is typed: "@Lord_Aldric". Names that can't survive the round trip
// (e.g. "St. Cuthbert") are inserted as stored tokens instead.
export function mentionText(entity, following = '') {
  const typed = `@${entity.name.trim().replace(/\s+/g, '_')}`;
  const back = findTyped(typed + following)[0];
  const ok = back && back.start === 0 && back.end === typed.length && key(back.name) === key(entity.name);
  return ok ? { text: typed, typed: true } : { text: storedToken(entity.name, entity.id), typed: false };
}

// Stored text -> what the edit box shows, plus the picks that pin each token to its
// entity. Tokens whose entity is gone stay in stored form, so an edit never makes stubs.
export function toTypedForm(storedText, byId) {
  const text = String(storedText ?? '');
  const picks = [];
  let out = '';
  let pos = 0;
  for (const s of findStored(text)) {
    const entity = resolveMerged(s.id, byId);
    out += text.slice(pos, s.start);
    if (isLive(entity)) {
      const m = mentionText(entity, text.slice(s.end, s.end + 40));
      out += m.text;
      if (m.typed) picks.push({ name: entity.name, id: entity.id });
    } else {
      out += text.slice(s.start, s.end);
    }
    pos = s.end;
  }
  return { text: out + text.slice(pos), picks };
}

// --- Display --------------------------------------------------------------

// What a mention shows: what was typed while it's still one of the entity's names
// ("Grimbold" for Grimbold Ironhand, "The Fox" for Mira Vane), spelled the entity's way;
// otherwise the current name, so a rename flows through (decision 2026-10-01).
export function displayLabel(label, entity) {
  const k = key(label);
  if (!k) return entity.name;
  for (const a of [entity.name, ...(entity.aliases || [])]) if (key(a) === k) return a;
  const words = entity.name.trim().split(/\s+/);
  const want = k.split(' ');
  for (let i = 0; i + want.length <= words.length; i++) {
    const slice = words.slice(i, i + want.length);
    if (key(slice.join(' ')) === k) return slice.join(' ');
  }
  return entity.name;
}

// Stored text -> segments for rendering. Mentions show the entity's current name.
export function segments(storedText, byId) {
  const text = String(storedText ?? '');
  const marks = [
    ...findStored(text).map((s) => {
      const e = resolveMerged(s.id, byId);
      return { ...s, type: 'mention', id: e && isLive(e) ? e.id : s.id, label: e && isLive(e) ? displayLabel(s.label, e) : s.label, missing: !isLive(e) };
    }),
    ...findTags(text).map((t) => ({ ...t, type: 'tag' })),
  ].sort((a, b) => a.start - b.start);
  const out = [];
  let pos = 0;
  for (const m of marks) {
    if (m.start < pos) continue;
    if (m.start > pos) out.push({ type: 'text', text: text.slice(pos, m.start) });
    out.push(m.type === 'mention'
      ? { type: 'mention', id: m.id, label: m.label, missing: m.missing }
      : { type: 'tag', text: text.slice(m.start, m.end), key: m.key });
    pos = m.end;
  }
  if (pos < text.length) out.push({ type: 'text', text: text.slice(pos) });
  return out;
}

// Stored text with mentions as current names: for search and plain display.
export function plainText(storedText, byId) {
  return segments(storedText, byId).map((s) => (s.type === 'mention' ? s.label : s.text)).join('');
}

// --- Autocomplete ---------------------------------------------------------

// The @ or # token the caret is in, if any: { kind, start, end, query }.
export function activeToken(text, caret) {
  const t = String(text ?? '');
  let i = caret;
  while (i > 0 && TOKEN_CHAR.test(t[i - 1])) i--;
  const sigil = t[i - 1];
  if (sigil !== '@' && sigil !== '#') return null;
  const start = i - 1;
  if (start > 0 && /[\p{L}\p{N}_]/u.test(t[start - 1])) return null;
  if (inSpans(start, urlSpans(t))) return null;
  if (t.slice(i, caret) && !/^\p{L}/u.test(t.slice(i, caret))) return null;
  let end = caret;
  while (end < t.length && TOKEN_CHAR.test(t[end])) end++;
  return { kind: sigil, start, end, query: typedName(t.slice(i, caret)) };
}

// Prefix matches on name or alias first, then substring matches; newest first; up to 5.
export function suggestEntities(query, entities, limit = 5) {
  const q = key(query);
  const rank = (e) => {
    const names = [e.name, ...(e.aliases || [])].map(key);
    if (names.some((n) => n.startsWith(q))) return 0;
    if (names.some((n) => n.includes(q))) return 1;
    return 2;
  };
  return entities
    .filter(isLive)
    .map((e) => ({ e, r: rank(e) }))
    .filter((x) => x.r < 2)
    .sort((a, b) => a.r - b.r || cmp(b.e.updated_at, a.e.updated_at) || cmp(a.e.id, b.e.id))
    .slice(0, limit)
    .map((x) => x.e);
}

// Replaces the active token with the picked text and a trailing space.
export function replaceToken(text, token, insert) {
  const after = text.slice(token.end);
  const space = /^\s/.test(after) ? '' : ' ';
  const out = text.slice(0, token.start) + insert + space + after;
  return { text: out, caret: token.start + insert.length + 1 };
}

export function applyEntityPick(text, token, entity) {
  const m = mentionText(entity, '');
  const r = replaceToken(text, token, m.text);
  return { ...r, pick: m.typed ? { name: entity.name, id: entity.id } : null };
}

// --- Recall: names typed without @ ----------------------------------------

// Names grouped by their first word: scanning the text once and checking only names
// whose first word appears keeps recall fast with hundreds of entities. Checking is a
// plain character comparison, not a regex per name: compiling hundreds of Unicode
// regexes took ~250 ms in Firefox after every save (M10).
function phraseTable(index) {
  if (index.phraseTable) return index.phraseTable;
  const table = new Map();
  const add = (k, id) => {
    const first = k.match(/^[\p{L}\p{N}_]+/u)?.[0];
    if (!first) return;
    if (!table.has(first)) table.set(first, []);
    table.get(first).push({ phrase: k, id });
  };
  for (const [k, list] of index.exact) add(k, list[0].id);
  for (const [k, e] of index.short) if (!index.exact.has(k)) add(k, e.id);
  index.phraseTable = table;
  return table;
}

const IS_WORD = /[\p{L}\p{N}_]/u;
const IS_SPACE = /\s/u;

// Does `phrase` (a key: lower case, single spaces, straight apostrophes) start at
// text[pos], ending at a word boundary? Returns the end index or -1.
function matchAt(text, pos, phrase) {
  let i = pos;
  for (let j = 0; j < phrase.length; j++) {
    const p = phrase[j];
    if (p === ' ') {
      if (i >= text.length || !IS_SPACE.test(text[i])) return -1;
      while (i < text.length && IS_SPACE.test(text[i])) i++;
      continue;
    }
    const c = text[i];
    if (c === undefined) return -1;
    if (p === "'") {
      if (c !== "'" && c !== '\u2019' && c !== '\u2018' && c !== '\u02BC') return -1;
    } else if (c.toLowerCase() !== p && c.normalize('NFC').toLowerCase() !== p) {
      return -1;
    }
    i++;
  }
  return i < text.length && IS_WORD.test(text[i]) ? -1 : i;
}

const WORD_RUN = /[\p{L}\p{N}_]+/gu;

// Plain-text occurrences of exact names, aliases and short names (not inside
// @tokens, #tags or URLs): [{ start, end, id, text }].
export function findNames(text, index) {
  const t = String(text ?? '');
  const skip = [
    ...urlSpans(t),
    ...findStored(t).map((s) => [s.start, s.end]),
    ...findTyped(t).map((s) => [s.start, s.end]),
    ...findTags(t).map((s) => [s.start, s.end]),
  ];
  const table = phraseTable(index);
  const out = [];
  for (const run of t.matchAll(WORD_RUN)) {
    // Runs are maximal, so the character before one is never a word character;
    // a name straight after @ or # belongs to a mention or tag.
    const pos = run.index;
    if (pos > 0 && (t[pos - 1] === '@' || t[pos - 1] === '#')) continue;
    const candidates = table.get(run[0].normalize('NFC').toLowerCase());
    if (!candidates) continue;
    for (const c of candidates) {
      const end = matchAt(t, pos, c.phrase);
      if (end < 0 || overlaps(pos, end, skip)) continue;
      out.push({ start: pos, end, id: c.id, text: t.slice(pos, end) });
    }
  }
  // "lord aldric" means Lord Aldric, not also an entity called "Aldric" inside it.
  return out.filter((o) => !out.some((p) => p !== o && p.start <= o.start && p.end >= o.end && p.end - p.start > o.end - o.start));
}

// Entities named in the text, most recently typed first (by where their last mention ends).
export function namedEntities(text, index, { exclude = [], limit = 3 } = {}) {
  const lastEnd = new Map();
  for (const o of findNames(text, index)) {
    if (exclude.includes(o.id)) continue;
    lastEnd.set(o.id, Math.max(lastEnd.get(o.id) ?? -1, o.end));
  }
  return [...lastEnd.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => index.byId.get(id));
}

// Tap-to-link picks the occurrence that ends last; among those, the longest,
// so "lord aldric" beats the short name "aldric" inside it.
export function linkTarget(text, entityId, index) {
  const occ = findNames(text, index).filter((o) => o.id === entityId);
  occ.sort((a, b) => b.end - a.end || (b.end - b.start) - (a.end - a.start));
  return occ[0] ?? null;
}

export function linkOccurrence(text, occ, entity) {
  const typed = `@${occ.text.replace(/\s+/g, '_')}`;
  const back = findTyped(typed + text.slice(occ.end, occ.end + 40))[0];
  const ok = back && back.start === 0 && back.end === typed.length;
  const insert = ok ? typed : storedToken(entity.name, entity.id);
  return {
    text: text.slice(0, occ.start) + insert + text.slice(occ.end),
    caret: occ.start + insert.length,
    pick: ok ? { name: typedName(occ.text), id: entity.id } : null,
  };
}
