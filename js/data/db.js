// The IndexedDB schema (SPEC 3.8). Only data/ modules import this.
import Dexie from 'dexie';

// Not "satchel": v1's database stays untouched on devices that ran it.
export const DB_NAME = 'satchel-v2';

export const BUNDLE_TABLES = ['entities', 'types', 'notes', 'relationships', 'files'];
export const ALL_TABLES = [...BUNDLE_TABLES, 'blobs', 'meta'];

// Only fields we query on are indexed. Booleans and nulls can't be indexed,
// so `deleted` and `triaged_at` are filtered in code.
function open(name) {
  const db = new Dexie(name);
  db.version(1).stores({
    entities: 'id, type_id',
    types: 'id',
    notes: 'id, created_at',
    relationships: 'id, from_id, to_id',
    files: 'id, entity_id',
    blobs: 'id',
    meta: 'key',
  });
  return db;
}

let current = null;
export function db() {
  current ??= open(DB_NAME);
  return current;
}
