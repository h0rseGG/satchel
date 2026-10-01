// Everything the capture box needs in one live query: names, types, tags, search.
import { db } from './db.js';

export async function captureData() {
  const d = db();
  const [entities, types, notes] = await Promise.all([d.entities.toArray(), d.types.toArray(), d.notes.toArray()]);
  return { entities, types, notes: notes.filter((n) => !n.deleted) };
}
