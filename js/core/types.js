// Entity types: built-ins and custom, all in one table (SPEC 3.2). Pure.
import { makeRecord, isLive, newId } from './model.js';

export const FIELD_KINDS = ['text', 'long_text', 'number', 'date', 'link', 'url'];

// Fixed ids so kits from any device agree. Timestamps are fixed too: a built-in
// that nobody has edited must be byte-identical everywhere, or merges would churn.
const EPOCH = '2026-01-01T00:00:00.000Z';
const BUILTINS = [
  ['type-npc', 'NPC', 'NPCs', true],
  ['type-location', 'Location', 'Locations', false],
  ['type-faction', 'Faction', 'Factions', false],
  ['type-item', 'Item', 'Items', false],
  ['type-character', 'Character', 'Characters', true],
  ['type-other', 'Other', 'Other', false],
];

export function builtinTypes() {
  return BUILTINS.map(([id, label, plural, person], order) =>
    makeRecord('types', { label, plural, person, builtin: true, fields: [], order }, { id, now: EPOCH }));
}

export const BUILTIN_IDS = BUILTINS.map((b) => b[0]);

export function makeType({ label, plural, person = false, order = 0 }, opts) {
  return makeRecord('types', { label: label.trim(), plural: (plural || `${label}s`).trim(), person, builtin: false, fields: [], order }, opts);
}

// Stubs have no type yet and are treated as people: most stubs are names overheard at the table.
export function isPerson(entity, typesById) {
  if (!entity) return false;
  if (entity.type_id == null) return !!entity.stub;
  return !!typesById.get(entity.type_id)?.person;
}

export function addField(type, { label, kind, link_type = null }, { now, id = `f-${newId()}` } = {}) {
  if (!FIELD_KINDS.includes(kind)) throw new Error(`Unknown field kind: ${kind}`);
  const field = { id, label: label.trim(), kind };
  if (kind === 'link' && link_type) field.link_type = link_type;
  return { ...type, fields: [...type.fields, field], updated_at: now ?? type.updated_at };
}

export function renameField(type, fieldId, label, { now } = {}) {
  return { ...type, fields: type.fields.map((f) => (f.id === fieldId ? { ...f, label: label.trim() } : f)), updated_at: now ?? type.updated_at };
}

// Values stay on the entities, so re-adding a field with the same id restores them.
export function removeField(type, fieldId, { now } = {}) {
  return { ...type, fields: type.fields.filter((f) => f.id !== fieldId), updated_at: now ?? type.updated_at };
}

export function liveUsers(typeId, entities) {
  return entities.filter((e) => isLive(e) && e.type_id === typeId);
}

// A custom type can go when nothing live uses it, or once its entities are moved (caller confirms).
export function canDeleteType(type, entities) {
  if (type.builtin) return { ok: false, reason: 'builtin' };
  const n = liveUsers(type.id, entities).length;
  return n === 0 ? { ok: true } : { ok: false, reason: 'in-use', count: n };
}

export function fieldValueError(kind, value) {
  if (value === '' || value == null) return null;
  switch (kind) {
    case 'number': return Number.isFinite(Number(value)) ? null : 'not-a-number';
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? null : 'not-a-date';
    case 'url': {
      try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:' ? null : 'not-a-url'; } catch { return 'not-a-url'; }
    }
    case 'link': return typeof value === 'string' ? null : 'not-a-link';
    default: return typeof value === 'string' ? null : 'not-text';
  }
}

export function sortTypes(types) {
  return [...types].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'en-AU'));
}
