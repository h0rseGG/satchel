// Entity types.
import { db } from './db.js';
import { sortTypes } from '../core/types.js';

export async function allTypes() {
  return sortTypes((await db().types.toArray()).filter((t) => !t.deleted));
}

export async function typesById() {
  return new Map((await db().types.toArray()).map((t) => [t.id, t]));
}
