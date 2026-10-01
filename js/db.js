// Browser database (IndexedDB via Dexie). Keep this file thin: rules and
// record shapes live in model.js, which is unit tested without a browser.

import Dexie from 'dexie';
import { live, makeEntity, makeNote, newId, now, touch } from './model.js';
import { findTyped, resolveMentions } from './mentions.js';
import { KitError, kitFilename, packKit } from './kit.js';
import { TABLES, mergeData } from './merge.js';

export const db = new Dexie('satchel');

// Only fields we query on are listed (the first one is the primary key).
// IndexedDB can't index booleans or nulls, so `deleted` and `triaged_at`
// are filtered in JS instead. Changing this list needs a new db.version().
// This is the local browser database version, not the kit file's schema_version.
export const STORES = {
  entities: 'id, type, updated_at',
  notes: 'id, created_at, session_id, *mentions',
  sessions: 'id, number',
  relationships: 'id, from_id, to_id',
  images: 'id, entity_id',
  blobs: 'id',   // image bytes, kept apart so listing images stays fast
  meta: 'key',   // local-only settings: bundle_id, pc_entity_id, backup and sync status
};

db.version(1).stores(STORES);

// v2: notes saved before @mentions existed (build step 5) still hold plain
// "@Name" text. Link them now, using the same rules as a new note.
db.version(2).stores(STORES).upgrade(relinkTypedMentions);

export async function relinkTypedMentions(tx) {
  const entities = tx.table('entities');
  const notes = tx.table('notes');
  const ents = live(await entities.toArray());
  for (const n of await notes.toArray()) {
    if (n.deleted || !findTyped(n.text).length) continue;
    const r = resolveMentions(n.text, ents);
    for (const e of r.created) {
      await entities.add(e);
      ents.push(e);
    }
    await notes.put(touch(n, { text: r.text, mentions: r.mentions }));
  }
}

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  return db.meta.put({ key, value });
}

// True when nothing has been saved yet (used to offer "Restore from backup").
export async function isEmpty() {
  return !(await getMeta('bundle_id'));
}

// First run: create the bundle and the player-character entity.
export async function createBundle(pcName) {
  return db.transaction('rw', db.entities, db.meta, async () => {
    const pc = makeEntity({ name: pcName, type: 'character', stub: false });
    await db.entities.add(pc);
    await setMeta('bundle_id', newId());
    await setMeta('pc_entity_id', pc.id);
    await setMeta('created_at', now());
    return pc;
  });
}

// Save a changed record and count it towards "changes since backup/sync".
// The first unsaved change also records when it happened, which ages the
// backup badge (js/backup.js).
export async function save(table, record) {
  await db.transaction('rw', db[table], db.meta, async () => {
    await db[table].put(record);
    const changes = await getMeta('changes_since_backup', 0);
    if (!changes) await setMeta('first_change_at', now());
    await setMeta('changes_since_backup', changes + 1);
    await setMeta('changes_since_sync', (await getMeta('changes_since_sync', 0)) + 1);
  });
  return record;
}

// Update fields on an existing record by id.
export async function update(table, id, changes) {
  const rec = await db[table].get(id);
  if (!rec) throw new Error(`${table} ${id} not found`);
  return save(table, touch(rec, changes));
}

// Save a new note, resolving @mentions: an autocomplete pick wins, then an
// exact name/alias match, otherwise a stub is created. All in one
// transaction, so a failed save leaves no orphan stubs.
// picked: { [nameKey]: entityId } from autocomplete.
// The first note ever also asks for persistent storage.
export async function addNote({ text, mode = 'out', session_id = null, picked = {} }) {
  const note = await db.transaction('rw', db.entities, db.notes, db.meta, async () => {
    const r = resolveMentions(text, live(await db.entities.toArray()), picked);
    for (const e of r.created) await save('entities', e);
    return save('notes', makeNote({ text: r.text, mode, session_id, mentions: r.mentions }));
  });
  if (!(await getMeta('persist_asked'))) {
    await setMeta('persist_asked', true);
    requestPersist().catch((err) => console.warn('persist() failed', err));
  }
  return note;
}

// Pack everything into a kit. Returns { bytes, filename }.
// Reads in one transaction so the kit is a consistent snapshot.
export async function packCurrentKit() {
  const snap = await db.transaction('r', [db.entities, db.notes, db.sessions, db.relationships, db.images, db.blobs, db.meta], async () => ({
    bundle_id: await getMeta('bundle_id'),
    pc_entity_id: await getMeta('pc_entity_id'),
    entities: await db.entities.toArray(),
    notes: await db.notes.toArray(),
    sessions: await db.sessions.toArray(),
    relationships: await db.relationships.toArray(),
    images: await db.images.toArray(),
    blobs: await db.blobs.toArray(),
  }));
  // Image bytes (week 3): blobs rows are { id, data: Blob }.
  const imageFiles = new Map();
  for (const b of snap.blobs) imageFiles.set(b.id, new Uint8Array(await b.data.arrayBuffer()));
  const pc = snap.entities.find((e) => e.id === snap.pc_entity_id);
  return { bytes: packKit({ ...snap, imageFiles }), filename: kitFilename(pc?.name) };
}

// ---------- Unpack kit ----------

const DATA_TABLES = () => [db.entities, db.notes, db.sessions, db.relationships, db.images, db.blobs, db.meta];

async function readLocal() {
  const out = {};
  for (const t of TABLES) out[t] = await db[t].toArray();
  return out;
}

async function putImageFiles(imageFiles) {
  for (const [id, bytes] of imageFiles) {
    await db.blobs.put({ id, data: new Blob([bytes], { type: 'image/webp' }) });
  }
}

// What unpacking this kit would do, for the confirm screen.
// mode: 'new' (app empty), 'merge' (same character), or 'different'.
export async function planUnpack(data) {
  const bundleId = await getMeta('bundle_id');
  if (!bundleId) return { mode: 'new' };
  if (bundleId !== data.bundle_id) return { mode: 'different' };
  const { report } = mergeData(await readLocal(), data);
  return { mode: 'merge', report };
}

// New: load a kit into an empty app. The kit is a backup of exactly this
// data, so the badge starts from the kit's exported_at.
export async function unpackNew(data) {
  await db.transaction('rw', DATA_TABLES(), async () => {
    if (await getMeta('bundle_id')) throw new KitError('This device already has a character. Use Merge instead.');
    for (const t of TABLES) await db[t].bulkPut(data[t]);
    await putImageFiles(data.imageFiles);
    await setMeta('bundle_id', data.bundle_id);
    await setMeta('pc_entity_id', data.pc_entity_id);
    await setMeta('created_at', now());
    await setMeta('last_backup_at', data.exported_at ?? now());
    await setMeta('changes_since_backup', 0);
    await setMeta('first_change_at', null);
    await setMeta('changes_since_sync', 0);
  });
}

// Merge: union with what's here (SPEC D9). Re-reads local data inside the
// transaction, so anything typed since the confirm screen is included.
// Doesn't touch the change counters: "changes since backup" means edits made
// on this device that aren't in any kit yet. Merged-in records came from a
// kit, and stub/redirect fixes can be redone from the kits.
export async function unpackMerge(data) {
  return db.transaction('rw', DATA_TABLES(), async () => {
    if ((await getMeta('bundle_id')) !== data.bundle_id) {
      throw new KitError('This kit is a different character, so it can’t be merged.');
    }
    const { writes, report } = mergeData(await readLocal(), data);
    for (const t of TABLES) await db[t].bulkPut(writes[t]);
    const have = new Set(await db.blobs.toCollection().primaryKeys());
    await putImageFiles([...data.imageFiles].filter(([id]) => !have.has(id)));
    return report;
  });
}

// ---------- Replace / start over (destructive) ----------

// Meta keys that describe the browser, not the character: kept on wipe.
const DEVICE_META = ['persist_asked', 'persist_granted'];

async function clearCharacter() {
  for (const t of [...TABLES, 'blobs']) await db[t].clear();
  const keys = await db.meta.toCollection().primaryKeys();
  await db.meta.bulkDelete(keys.filter((k) => !DEVICE_META.includes(k)));
}

// What would be lost, for the warning: { pcName, notes, entities }.
export async function localSummary() {
  const pcId = await getMeta('pc_entity_id');
  const entities = live(await db.entities.toArray());
  const notes = live(await db.notes.toArray());
  return {
    pcName: entities.find((e) => e.id === pcId)?.name ?? '',
    notes: notes.length,
    entities: entities.length,
  };
}

// Replace this device's character with a kit. One transaction: if loading
// the kit fails, the old character is left exactly as it was.
export async function replaceWithKit(data) {
  await db.transaction('rw', DATA_TABLES(), async () => {
    await clearCharacter();
    await unpackNew(data);
  });
}

// Delete this device's character; the app returns to the first-run screen.
export async function startOver() {
  await db.transaction('rw', DATA_TABLES(), clearCharacter);
}

// Called after a kit download starts. "Backed up" means the file was
// downloaded, not that it's stored safely (SPEC section 6).
export async function markBackedUp() {
  await setMeta('last_backup_at', now());
  await setMeta('changes_since_backup', 0);
  await setMeta('first_change_at', null);
}

// Everything the backup badge needs, in one read.
export async function backupMeta() {
  return {
    last_backup_at: await getMeta('last_backup_at'),
    changes_since_backup: await getMeta('changes_since_backup', 0),
    first_change_at: await getMeta('first_change_at'),
  };
}

// Ask the browser not to evict our data. Firefox shows a prompt on desktop
// and Android (SPEC 3, verification results).
export async function requestPersist() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  const granted = await navigator.storage.persist();
  await setMeta('persist_granted', granted);
  return granted;
}
