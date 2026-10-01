// Entities: people, places, things, stubs.
import { db } from './db.js';
import { save } from './store.js';
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
