// Entity types and their fields.
import { db } from './db.js';
import { save, saveMany } from './store.js';
import { sortTypes, makeType, addField as coreAddField, renameField as coreRenameField, removeField as coreRemoveField, canDeleteType } from '../core/types.js';
import { isoNow, tombstone } from '../core/model.js';

export async function allTypes() {
  return sortTypes((await db().types.toArray()).filter((t) => !t.deleted));
}

export async function typesById() {
  return new Map((await db().types.toArray()).map((t) => [t.id, t]));
}

export async function getType(id) {
  return db().types.get(id);
}

export async function createType({ label, plural, person = false }, { now = isoNow() } = {}) {
  const types = await allTypes();
  const t = makeType({ label, plural, person, order: Math.max(0, ...types.map((x) => x.order)) + 1 }, { now });
  await save('types', t, { now });
  return t;
}

// Built-ins can be renamed (label only; ids stay fixed) and get fields, but not deleted.
export async function updateType(id, patch, { now = isoNow() } = {}) {
  const t = await db().types.get(id);
  await save('types', { ...t, ...patch, updated_at: now }, { now });
}

async function change(id, fn, now) {
  const t = await db().types.get(id);
  await save('types', fn(t, now), { now });
}

export const addField = (id, field, { now = isoNow() } = {}) => change(id, (t) => coreAddField(t, field, { now }), now);
export const renameField = (id, fieldId, label, { now = isoNow() } = {}) => change(id, (t) => coreRenameField(t, fieldId, label, { now }), now);
export const removeField = (id, fieldId, { now = isoNow() } = {}) => change(id, (t) => coreRemoveField(t, fieldId, { now }), now);

// moveTo: the type its live entities move to first (required when it's in use).
export async function deleteType(id, { moveTo = null, now = isoNow() } = {}) {
  const d = db();
  const t = await d.types.get(id);
  const entities = await d.entities.where('type_id').equals(id).toArray();
  const check = canDeleteType(t, entities);
  if (!check.ok && !(check.reason === 'in-use' && moveTo)) throw new Error(`Can't delete type: ${check.reason}`);
  const moves = entities.filter((e) => !e.deleted).map((e) => ({ table: 'entities', record: { ...e, type_id: moveTo, stub: false, updated_at: now } }));
  await saveMany([...moves, { table: 'types', record: tombstone(t, now) }], { now });
}
