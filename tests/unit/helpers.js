// Small builders for core tests.
import { makeRecord } from '../../js/core/model.js';
import { builtinTypes } from '../../js/core/types.js';

export const T0 = '2026-09-01T10:00:00.000Z';
export const types = builtinTypes();
export const typesById = new Map(types.map((t) => [t.id, t]));

let n = 0;
export function ent(name, extra = {}) {
  n += 1;
  return makeRecord('entities', { name, type_id: 'type-npc', ...extra }, { id: extra.id ?? `e${n}-${name.replace(/\W+/g, '').toLowerCase()}`, now: extra.updated_at ?? T0 });
}
export const stub = (name, extra = {}) => ent(name, { type_id: null, stub: true, ...extra });
