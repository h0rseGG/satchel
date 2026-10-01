// Entities: people, places, things, stubs.
import { db } from './db.js';
import { save, saveMany } from './store.js';
import { getMeta, bumpEpoch } from './meta.js';
import { mergeEntityInto } from '../core/merge.js';
import { addFile, UploadError } from './files.js';
import { classifyUpload } from '../core/files-rules.js';
import { isoNow, tombstone, makeRecord } from '../core/model.js';

export async function allEntities() {
  return db().entities.toArray();
}

export async function createEntity(fields, { now = isoNow() } = {}) {
  const e = makeRecord('entities', fields, { now });
  await save('entities', e, { now });
  return e;
}

// patch: plain field values. Unchanged values are a no-op (store.js).
export async function updateEntity(id, patch, { now = isoNow() } = {}) {
  const e = await db().entities.get(id);
  if (!e) throw new Error(`No entity ${id}`);
  const next = { ...e, ...patch, updated_at: now };
  if (patch.fields) next.fields = { ...(e.fields || {}), ...patch.fields };
  // Profile edits record a time per section so merges keep both devices' edits (SPEC 3.1).
  if (patch.profile) {
    const times = { ...(e.profile_times || {}) };
    for (const [s, v] of Object.entries(patch.profile)) if (v !== e.profile?.[s]) times[s] = now;
    next.profile = { ...(e.profile || {}), ...patch.profile };
    next.profile_times = times;
  }
  return (await save('entities', next, { now })) ? next : e;
}

export async function deleteEntity(id, { now = isoNow() } = {}) {
  const e = await db().entities.get(id);
  if (e && !e.deleted) await save('entities', tombstone(e, now), { now });
}

// Merge into… (SPEC 5.2): one transaction over everything that changes.
export async function mergeEntity(fromId, intoId, { now = isoNow() } = {}) {
  const d = db();
  const [entities, notes, relationships, files, bundle] = await Promise.all([d.entities.toArray(), d.notes.toArray(), d.relationships.toArray(), d.files.toArray(), getMeta('bundle')]);
  const changed = mergeEntityInto({ pc_entity_id: bundle?.pc_entity_id, entities, notes, relationships, files }, fromId, intoId, now);
  await saveMany(changed, { now });
  // Redirected notes keep their updated_at, so the capture store must reload.
  await bumpEpoch();
}

// Live entities of a type (or stubs when typeId is null), A–Z.
export async function entitiesOfType(typeId) {
  const list = typeId == null
    ? await db().entities.filter((e) => !e.deleted && !e.type_id).toArray()
    : await db().entities.where('type_id').equals(typeId).filter((e) => !e.deleted).toArray();
  return list.sort((a, b) => a.name.localeCompare(b.name, 'en-AU', { sensitivity: 'base' }));
}

// { [typeId]: count, stubs: count } for live entities, without the player character.
export async function worldCounts() {
  const bundle = await getMeta('bundle');
  const counts = { stubs: 0 };
  await db().entities.each((e) => {
    if (e.deleted || e.id === bundle?.pc_entity_id) return;
    if (!e.type_id) counts.stubs++;
    else counts[e.type_id] = (counts[e.type_id] || 0) + 1;
  });
  return counts;
}

// Notes that mention an entity, newest first.
export async function notesMentioning(id) {
  return (await db().notes.where('mentions').equals(id).filter((n) => !n.deleted).sortBy('created_at')).reverse();
}

// Uploads an image and makes it the entity's picture (the file also appears in Files).
export async function setPortrait(entityId, file, { now = isoNow() } = {}) {
  const check = classifyUpload({ name: file.name, type: file.type, size: file.size });
  if (check.ok && check.kind !== 'image') throw new UploadError('not-image');
  const rec = await addFile(file, { entityId, now });
  await updateEntity(entityId, { portrait_file_id: rec.id }, { now });
  return rec;
}
