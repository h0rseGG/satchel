// Every write goes through here: no-op detection, one transaction, change counting.
import { db, BUNDLE_TABLES } from './db.js';
import { sameValue } from '../core/json.js';
import { recordChanges } from '../core/backup.js';
import { isoNow } from '../core/model.js';
import { getMeta, setMeta } from './meta.js';

// "Saving the same value is a no-op" (SPEC 5.3): compare ignoring updated_at,
// so a caller that stamped a fresh time on unchanged data doesn't count a change.
const content = ({ updated_at, ...rest }) => rest;

// items: [{ table, record }]. Returns how many records actually changed.
// countAsChange: false for merges and other non-user writes (v1 lesson 5).
export async function saveMany(items, { countAsChange = true, now = isoNow() } = {}) {
  if (!items.length) return 0;
  const d = db();
  return d.transaction('rw', [...BUNDLE_TABLES, 'meta'], async () => {
    let changed = 0;
    for (const { table, record } of items) {
      const prev = await d.table(table).get(record.id);
      if (prev && sameValue(content(prev), content(record))) continue;
      await d.table(table).put(record);
      changed++;
    }
    if (changed && countAsChange) await setMeta('backup', recordChanges(await getMeta('backup'), changed, now));
    return changed;
  });
}

export function save(table, record, opts) {
  return saveMany([{ table, record }], opts);
}

export async function getRecord(table, id) {
  return db().table(table).get(id);
}

export async function allLive(table) {
  return (await db().table(table).toArray()).filter((r) => !r.deleted);
}
