import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inbox, sorted, inboxCount, filterNotes, newest, worldCounts } from '../../js/core/notelists.js';

const n = (id, created, extra = {}) => ({ id, created_at: `2026-09-0${created}T00:00:00.000Z`, mode: 'out', triaged_at: null, tags: [], mentions: [], ...extra });
const notes = [n('c', 3, { mode: 'in' }), n('a', 1), n('b', 2, { triaged_at: 'x', tags: ['debts'], mentions: ['g'] }), n('d', 4, { mode: 'in', mentions: ['g'] })];

test('inbox: unsorted, oldest first, by mode; sorted: newest first; counts', () => {
  assert.deepEqual(inbox(notes).map((x) => x.id), ['a', 'c', 'd']);
  assert.deepEqual(inbox(notes, 'in').map((x) => x.id), ['c', 'd']);
  assert.deepEqual(sorted(notes).map((x) => x.id), ['b']);
  assert.equal(inboxCount(notes), 3);
});

test('notes list: newest first, filtered by mode, tag and entity', () => {
  assert.deepEqual(filterNotes(notes).map((x) => x.id), ['d', 'c', 'b', 'a']);
  assert.deepEqual(filterNotes(notes, { tag: 'debts' }).map((x) => x.id), ['b']);
  assert.deepEqual(filterNotes(notes, { entity: 'g', mode: 'in' }).map((x) => x.id), ['d']);
  assert.deepEqual(newest(notes, 2).map((x) => x.id), ['d', 'c']);
});

test('world counts skip the player character and the deleted', () => {
  const es = [{ id: 'pc', type_id: 'type-character' }, { id: 'k', type_id: 'type-character' }, { id: 's', type_id: null, stub: true }, { id: 'x', type_id: 'type-npc', deleted: true }];
  assert.deepEqual(worldCounts(es, 'pc'), { stubs: 1, 'type-character': 1 });
});
