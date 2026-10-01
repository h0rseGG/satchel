// Kits: export, and import as New, Merge or Replace (SPEC 7). Each import validates
// everything first (core/kit.js) and writes in one transaction, so a failure leaves
// the old data exactly as it was.
import { db, BUNDLE_TABLES, ALL_TABLES } from './db.js';
import { getMeta, setMeta } from './meta.js';
import { packKit, unpackKit } from '../core/kit.js';
import { mergeBundles } from '../core/merge.js';
import { recordBackup } from '../core/backup.js';
import { sameValue } from '../core/json.js';
import { makePcEntity, newId, isoNow } from '../core/model.js';
import { builtinTypes } from '../core/types.js';
import { emptyBackupMeta } from '../core/backup.js';

async function readBundle() {
  const d = db();
  const meta = await getMeta('bundle');
  const tables = Object.fromEntries(await Promise.all(BUNDLE_TABLES.map(async (t) => [t, await d.table(t).toArray()])));
  return { bundle_id: meta?.bundle_id, pc_entity_id: meta?.pc_entity_id, ...tables };
}

async function readBlobs(files) {
  const rows = await db().blobs.bulkGet(files.filter((f) => !f.deleted).map((f) => f.id));
  const out = new Map();
  for (const r of rows) if (r) out.set(r.id, new Uint8Array(await (r.data instanceof Blob ? r.data.arrayBuffer() : r.data)));
  return out;
}

// { bytes, filename, exported_at }. Call markBackedUp() once the download is handed over.
export async function buildKit({ now = new Date() } = {}) {
  const bundle = await readBundle();
  return packKit(bundle, await readBlobs(bundle.files), { now });
}

export async function markBackedUp(exportedAt) {
  await setMeta('backup', recordBackup(await getMeta('backup'), exportedAt));
}

// Reads a kit without writing anything: { ok, bundle, blobs, report } or { ok: false, error }.
export async function readKit(file) {
  return unpackKit(new Uint8Array(await file.arrayBuffer()));
}

const blobRows = (blobs, files) => {
  const mime = new Map(files.map((f) => [f.id, f.mime]));
  return [...blobs].map(([id, bytes]) => ({ id, data: new Blob([bytes], { type: mime.get(id) || 'application/octet-stream' }) }));
};

// Clears the character (keeps device-level keys: session mode, persistence) and loads
// the kit. Used by New (empty app) and Replace. One transaction.
async function load(kit) {
  const d = db();
  await d.transaction('rw', ALL_TABLES, async () => {
    for (const t of [...BUNDLE_TABLES, 'blobs']) await d.table(t).clear();
    for (const t of BUNDLE_TABLES) await d.table(t).bulkPut(kit.bundle[t]);
    await d.blobs.bulkPut(blobRows(kit.blobs, kit.bundle.files));
    await setMeta('bundle', { bundle_id: kit.bundle.bundle_id, pc_entity_id: kit.bundle.pc_entity_id });
    // A freshly loaded kit is backed up as of when it was made (SPEC 7.2).
    await setMeta('backup', kit.bundle.exported_at ? recordBackup(emptyBackupMeta(), kit.bundle.exported_at) : emptyBackupMeta());
  });
}

export async function importNew(kit) {
  if (await getMeta('bundle')) throw new Error('Not empty: use Merge or Replace');
  await load(kit);
}

export const importReplace = (kit) => load(kit);

// Same character from another device. Doesn't count as unsaved changes (v1 lesson 5).
// Returns the merge report { added, updated, stubsCombined }.
export async function importMerge(kit) {
  const d = db();
  return d.transaction('rw', ALL_TABLES, async () => {
    const local = await readBundle();
    const { bundle, report, blobsNeeded } = mergeBundles(local, kit.bundle);
    for (const t of BUNDLE_TABLES) {
      const before = new Map(local[t].map((r) => [r.id, r]));
      const changed = bundle[t].filter((r) => !before.has(r.id) || !sameValue(before.get(r.id), r));
      if (changed.length) await d.table(t).bulkPut(changed);
    }
    const need = new Map(blobsNeeded.filter((id) => kit.blobs.has(id)).map((id) => [id, kit.blobs.get(id)]));
    if (need.size) await d.blobs.bulkPut(blobRows(need, bundle.files));
    for (const f of bundle.files) if (f.deleted) await d.blobs.delete(f.id);
    if (bundle.pc_entity_id !== local.pc_entity_id) await setMeta('bundle', { bundle_id: local.bundle_id, pc_entity_id: bundle.pc_entity_id });
    return report;
  });
}

// New character: clears everything but device-level keys, then starts fresh. One transaction.
export async function startOver(name, { now = isoNow() } = {}) {
  const d = db();
  await d.transaction('rw', ALL_TABLES, async () => {
    for (const t of [...BUNDLE_TABLES, 'blobs']) await d.table(t).clear();
    const pc = makePcEntity(name.trim(), { now });
    await d.types.bulkPut(builtinTypes());
    await d.entities.put(pc);
    await setMeta('bundle', { bundle_id: newId(), pc_entity_id: pc.id });
    await setMeta('backup', emptyBackupMeta());
  });
}
