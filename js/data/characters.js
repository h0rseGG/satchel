// The character bundle: creating one and reading the player character.
import { db, BUNDLE_TABLES } from './db.js';
import { getMeta, setMeta } from './meta.js';
import { makePcEntity, newId, isoNow } from '../core/model.js';
import { builtinTypes } from '../core/types.js';
import { emptyBackupMeta } from '../core/backup.js';

export async function hasCharacter() {
  return !!(await getMeta('bundle'));
}

// First run only: the app must be empty (Replace and New character clear it first, in M9).
export async function createCharacter(name, { now = isoNow() } = {}) {
  const d = db();
  return d.transaction('rw', [...BUNDLE_TABLES, 'meta'], async () => {
    if (await getMeta('bundle')) throw new Error('A character already exists');
    const pc = makePcEntity(name.trim(), { now });
    await d.types.bulkPut(builtinTypes());
    await d.entities.put(pc);
    const bundle = { bundle_id: newId(), pc_entity_id: pc.id };
    await setMeta('bundle', bundle);
    await setMeta('backup', emptyBackupMeta());
    return bundle;
  });
}

export async function getPc() {
  const bundle = await getMeta('bundle');
  return bundle ? db().entities.get(bundle.pc_entity_id) : null;
}
