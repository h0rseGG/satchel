// What the frame (top bar, crumbs) needs, in one live query.
import { db } from './db.js';
import { getMeta } from './meta.js';

export async function frameState() {
  const [bundle, session, backup, types] = await Promise.all([getMeta('bundle'), getMeta('session'), getMeta('backup'), db().types.toArray()]);
  const pc = bundle ? await db().entities.get(bundle.pc_entity_id) : null;
  return { bundle, pc, session, backup, types };
}

export async function getEntity(id) {
  return id ? db().entities.get(id) : null;
}

export async function getFile(id) {
  return id ? db().files.get(id) : null;
}
