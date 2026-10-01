// Relationships between entities (SPEC 3.5).
import { db } from './db.js';
import { save } from './store.js';
import { makeRecord, isoNow, tombstone } from '../core/model.js';
import { isDirected } from '../core/relationships.js';

export async function createRelationship({ from_id, to_id, type, directed, notes = '', source_note_ids = [] }, { now = isoNow() } = {}) {
  const t = type.trim().toLowerCase();
  const r = makeRecord('relationships', { from_id, to_id, type: t, directed: directed ?? isDirected({ type: t }), notes, source_note_ids }, { now });
  await save('relationships', r, { now });
  return r;
}

export async function deleteRelationship(id, { now = isoNow() } = {}) {
  const r = await db().relationships.get(id);
  if (r && !r.deleted) await save('relationships', tombstone(r, now), { now });
}

export function relationshipRecord(fields, now) {
  const t = fields.type.trim().toLowerCase();
  return makeRecord('relationships', { ...fields, type: t, directed: fields.directed ?? isDirected({ type: t }) }, { now });
}
