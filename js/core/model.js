// Record shapes and defaults (SPEC 3). Pure: callers pass `now` so tests are deterministic.
import { canonicalJson } from './json.js';

export const PROFILE_SECTIONS = ['concept', 'backstory', 'personality', 'ideals', 'bonds', 'flaws', 'goals', 'appearance', 'notes'];

export const TABLES = ['entities', 'types', 'notes', 'relationships', 'files'];

export function newId() {
  return crypto.randomUUID();
}

export function isoNow(date = new Date()) {
  return date.toISOString();
}

// Defaults per table. Used for new records and to fill gaps in imported kits.
const DEFAULTS = {
  entities: () => ({
    type_id: null, name: '', aliases: [], tags: [], summary: '', body: '', fields: {},
    stub: false, portrait_file_id: null, merged_into: null,
  }),
  types: () => ({ label: '', plural: '', person: false, builtin: false, fields: [], order: 0 }),
  notes: () => ({
    text: '', mentions: [], tags: [], mode: 'out', triaged_at: null, promoted_to: [], original_text: null,
  }),
  relationships: () => ({ from_id: null, to_id: null, type: '', directed: true, notes: '', source_note_ids: [] }),
  files: () => ({
    entity_id: null, name: '', kind: 'image', mime: '', size: 0, width: null, height: null, caption: '',
  }),
};

export function makeRecord(table, fields = {}, { now = isoNow(), id = newId() } = {}) {
  return normalise(table, { id, created_at: now, updated_at: now, deleted: false, ...fields });
}

// Fills missing fields with defaults and drops nothing (unknown fields survive a round trip).
export function normalise(table, record) {
  const base = DEFAULTS[table]();
  const out = { ...base, ...record };
  for (const [k, v] of Object.entries(base)) {
    if (Array.isArray(v) && !Array.isArray(out[k])) out[k] = [];
    if (v && typeof v === 'object' && !Array.isArray(v) && (typeof out[k] !== 'object' || out[k] === null || Array.isArray(out[k]))) out[k] = {};
  }
  out.deleted = out.deleted === true;
  out.created_at ??= out.updated_at ?? null;
  out.updated_at ??= out.created_at;
  return out;
}

export function touch(record, now = isoNow()) {
  return { ...record, updated_at: now };
}

export function tombstone(record, now = isoNow()) {
  return { ...record, deleted: true, updated_at: now };
}

export const isLive = (r) => !!r && !r.deleted;

export function makeProfile() {
  return Object.fromEntries(PROFILE_SECTIONS.map((s) => [s, '']));
}

// The player character entity carries the profile on top of the usual entity fields.
export function makePcEntity(name, opts) {
  return makeRecord('entities', {
    type_id: 'type-character', name, profile: makeProfile(), profile_times: {}, dndbeyond_url: '',
  }, opts);
}

// SPEC 3.1: D&D Beyond character pages, or the site's own ddb.ac share links.
export function isDndBeyondUrl(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return false; }
  return u.protocol === 'https:' && (u.hostname === 'www.dndbeyond.com' || u.hostname === 'dndbeyond.com' || u.hostname === 'ddb.ac');
}

// Follows merged_into redirects to the entity that absorbed this one.
export function resolveMerged(id, byId) {
  const seen = new Set();
  let cur = byId.get(id);
  while (cur && cur.merged_into && !seen.has(cur.id)) {
    seen.add(cur.id);
    const next = byId.get(cur.merged_into);
    if (!next) break;
    cur = next;
  }
  return cur ?? null;
}

// Which of two versions of the same record wins. Newest updated_at; on a tie the
// deletion wins, then the larger canonical JSON. Ties are settled by value, never by
// which side is local, so every device picks the same winner (v1 lesson 4).
export function newerOf(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.updated_at !== b.updated_at) return (a.updated_at ?? '') > (b.updated_at ?? '') ? a : b;
  if (!!a.deleted !== !!b.deleted) return a.deleted ? a : b;
  const ja = canonicalJson(a);
  const jb = canonicalJson(b);
  return ja >= jb ? a : b;
}
