// What a recall card shows (SPEC 4.5).
import { db } from './db.js';
import { sentence } from '../core/relationships.js';

// { entity, type, mentionCount, firstMention, lastMentions[3], relationships[3] (sentences) }
export async function recallCard(id) {
  const d = db();
  const entity = await d.entities.get(id);
  if (!entity || entity.deleted) return null;
  const [type, notes, from, to] = await Promise.all([
    entity.type_id ? d.types.get(entity.type_id) : null,
    d.notes.where('mentions').equals(id).filter((n) => !n.deleted).sortBy('created_at'),
    d.relationships.where('from_id').equals(id).toArray(),
    d.relationships.where('to_id').equals(id).toArray(),
  ]);
  const rels = [...from, ...to].filter((r) => !r.deleted).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  const others = await d.entities.bulkGet([...new Set(rels.flatMap((r) => [r.from_id, r.to_id]))]);
  const byId = new Map(others.filter(Boolean).map((e) => [e.id, e]));
  const live = rels.filter((r) => byId.get(r.from_id) && !byId.get(r.from_id).deleted && byId.get(r.to_id) && !byId.get(r.to_id).deleted);
  return {
    entity,
    type,
    mentionCount: notes.length,
    firstMention: notes[0] ?? null,
    lastMentions: notes.slice(-3).reverse(),
    relationships: live.slice(0, 3).map((r) => sentence(r, (x) => byId.get(x).name)),
  };
}
