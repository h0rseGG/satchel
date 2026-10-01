// Record factories and small pure helpers. No browser or database code here,
// so everything in this file can be unit tested with plain `node --test`.
// Field definitions: SPEC.md section 4.

// Kit file format version. 2 (2026-10-01): files/ replaces images/.
export const SCHEMA_VERSION = 2;
export const APP_VERSION = '0.1.0';

export const ENTITY_TYPES = ['character', 'npc', 'faction', 'location', 'item', 'other', 'unknown'];
export const NOTE_MODES = ['in', 'out'];

// Character page sections (SPEC section 7), stored on the player
// character's entity as profile: { concept, backstory, ... }.
export const PROFILE_SECTIONS = ['concept', 'backstory', 'personality', 'ideals', 'bonds', 'flaws', 'goals', 'appearance', 'notes'];

export function now() {
  return new Date().toISOString();
}

export function newId() {
  return crypto.randomUUID();
}

// Fields every record carries (SPEC section 4).
function base(at = now()) {
  return { id: newId(), created_at: at, updated_at: at, deleted: false };
}

// Mark a record as changed. Returns a new object; never mutates the input.
export function touch(record, changes = {}, at = now()) {
  return { ...record, ...changes, updated_at: at };
}

// Tombstone instead of removing, so Merge doesn't bring it back (D8).
export function tombstone(record, at = now()) {
  return touch(record, { deleted: true }, at);
}

// Trim and collapse whitespace. Used for display names.
export function cleanName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

// Key for case-insensitive name/alias matching.
export function nameKey(name) {
  return cleanName(name).toLowerCase();
}

// Free-form tags: trimmed, empty ones dropped, duplicates (ignoring case)
// removed. The first spelling of a tag is kept.
export function cleanTags(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags ?? []) {
    const clean = cleanName(t).replace(/^#/, '');
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function makeEntity({ name, type = 'unknown', stub = type === 'unknown', summary = '', body = '', aliases = [], tags = [] } = {}) {
  const clean = cleanName(name);
  if (!clean) throw new Error('Entity needs a name');
  if (!ENTITY_TYPES.includes(type)) throw new Error(`Unknown entity type: ${type}`);
  return {
    ...base(),
    type,
    name: clean,
    aliases: aliases.map(cleanName).filter(Boolean),
    tags: cleanTags(tags),
    summary,
    body,
    stub,
    image_ids: [],
    merged_into: null,
  };
}

// Set an entity's type. Choosing a real type means it's no longer a stub.
export function setType(entity, type, at = now()) {
  if (!ENTITY_TYPES.includes(type) || type === 'unknown') throw new Error(`Can't set type to ${type}`);
  return touch(entity, { type, stub: false }, at);
}

// Older records (before tags existed) get the fields they're missing.
export function withEntityDefaults(e) {
  return { aliases: [], tags: [], image_ids: [], merged_into: null, ...e };
}

export function makeNote({ text, mode = 'out', session_id = null, mentions = [] } = {}) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('Note is empty');
  if (!NOTE_MODES.includes(mode)) throw new Error(`Unknown note mode: ${mode}`);
  // session_id is optional: session records aren't tracked for now (SPEC D2).
  return {
    ...base(),
    text: t,
    original_text: null,
    mode,
    session_id: mode === 'in' ? session_id : null,
    mentions: [...new Set(mentions)],
    triaged_at: null,
    promoted_to: [],
  };
}

// Edit note text, keeping the very first version in original_text (D13).
export function editNote(note, text, at = now()) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('Note is empty');
  if (t === note.text) return note;
  return touch(note, { text: t, original_text: note.original_text ?? note.text }, at);
}

// An attached file's record. The bytes live separately (db `blobs`, kit
// `files/<id>.<ext>`). entity_id: what it's attached to, or null.
export function makeFile({ name, kind, mime, size, width = null, height = null, entity_id = null } = {}) {
  const clean = cleanName(name);
  if (!clean) throw new Error('A file needs a name');
  if (!['image', 'text'].includes(kind)) throw new Error(`Unknown file kind: ${kind}`);
  return { ...base(), entity_id, name: clean, kind, mime, size, width, height, caption: '' };
}

export function makeSession({ number } = {}) {
  if (!Number.isInteger(number) || number < 1) throw new Error('Session number must be a positive integer');
  const rec = base();
  return { ...rec, number, started_at: rec.created_at, ended_at: null, title: '', summary: '' };
}

// Suggested relationship types and whether each has a direction
// ("Kael owes Grimbold") or not ("Kael ↔ Mira, ally"). Any text is allowed.
export const RELATIONSHIP_TYPES = [
  ['ally', false], ['rival', false], ['family', false], ['enemy', false],
  ['owes', true], ['member of', true], ['located in', true], ['works for', true],
];

export function directedByDefault(type) {
  const hit = RELATIONSHIP_TYPES.find(([t]) => t === cleanName(type).toLowerCase());
  return hit ? hit[1] : true;
}

export function makeRelationship({ from_id, to_id, type, directed = false, notes = '', source_note_ids = [] } = {}) {
  if (!from_id || !to_id) throw new Error('Relationship needs both ends');
  if (from_id === to_id) throw new Error('Relationship cannot point at itself');
  const t = cleanName(type);
  if (!t) throw new Error('Relationship needs a type');
  return { ...base(), from_id, to_id, type: t, directed, notes, source_note_ids };
}

// Live (non-deleted) records only.
export function live(records) {
  return records.filter((r) => !r.deleted);
}
