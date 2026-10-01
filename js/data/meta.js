// Local-only state: never exported (SPEC 3.7).
import { db } from './db.js';
import { emptyBackupMeta } from '../core/backup.js';
import { outOfSession } from '../core/session.js';

// bundle: { bundle_id, pc_entity_id }          (cleared by Replace / New character)
// backup: { last_backup_at, changes_since_backup, first_change_at }
// session, persist: device-level, survive Replace and New character
export const DEVICE_KEYS = ['session', 'persist'];

const DEFAULTS = {
  bundle: () => null,
  backup: emptyBackupMeta,
  session: () => outOfSession(null),
  persist: () => ({ asked: false, granted: false }),
};

export async function getMeta(key) {
  const row = await db().meta.get(key);
  return row ? row.value : DEFAULTS[key]?.() ?? null;
}

export async function setMeta(key, value) {
  await db().meta.put({ key, value });
}
