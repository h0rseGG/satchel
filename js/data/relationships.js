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

// Live relationships touching an entity, with both ends live, newest first.
export async function relationshipsOf(id) {
  const d = db();
  const [from, to] = await Promise.all([d.relationships.where('from_id').equals(id).toArray(), d.relationships.where('to_id').equals(id).toArray()]);
  const rels = [...new Map([...from, ...to].filter((r) => !r.deleted).map((r) => [r.id, r])).values()];
  const ends = await d.entities.bulkGet([...new Set(rels.flatMap((r) => [r.from_id, r.to_id]))]);
  const live = new Set(ends.filter((e) => e && !e.deleted).map((e) => e.id));
  return rels.filter((r) => live.has(r.from_id) && live.has(r.to_id)).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export async function updateRelationship(id, patch, { now = isoNow() } = {}) {
  const r = await db().relationships.get(id);
  await save('relationships', { ...r, ...patch, updated_at: now }, { now });
}
