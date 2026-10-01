import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, href, crumbs } from '../../js/ui/app/routes.js';
import { S } from '../../js/ui/strings.js';
import { count, when } from '../../js/ui/format.js';

test('parse routes', () => {
  assert.deepEqual(parseHash(''), { name: 'home', params: {}, query: {} });
  assert.deepEqual(parseHash('#/'), { name: 'home', params: {}, query: {} });
  assert.equal(parseHash('#/inbox').name, 'inbox');
  assert.deepEqual(parseHash('#/world/type-npc'), { name: 'type', params: { typeId: 'type-npc' }, query: {} });
  assert.equal(parseHash('#/world/stubs').name, 'stubs');
  assert.deepEqual(parseHash('#/entity/abc').params, { id: 'abc' });
  assert.deepEqual(parseHash('#/notes?tag=do%20not%20trust&mode=in').query, { tag: 'do not trust', mode: 'in' });
  assert.equal(parseHash('#/nope/really').name, 'notfound');
});

test('href round-trips', () => {
  for (const [name, params, query] of [['type', { typeId: 'type-npc' }], ['entity', { id: 'a b' }], ['notes', {}, { tag: 'do not trust', mode: '' }], ['file', { id: 'f1' }]]) {
    const r = parseHash(href(name, params, query));
    assert.equal(r.name, name);
    assert.deepEqual(r.params, params);
  }
  assert.equal(href('notes', {}, { tag: 'debts', mode: '' }), '#/notes?tag=debts');
});

test('breadcrumbs', () => {
  const ents = { g: { id: 'g', name: 'Grimbold Ironhand', type_id: 'type-npc' }, s: { id: 's', name: 'Pip', stub: true, type_id: null } };
  const look = { S, typeLabel: (id) => ({ 'type-npc': 'NPCs' })[id], entity: (id) => ents[id] ?? null, file: () => null };
  const labels = (h) => crumbs(parseHash(h), look).map((c) => c.label);
  assert.deepEqual(labels('#/'), []);
  assert.deepEqual(labels('#/entity/g'), ['World', 'NPCs', 'Grimbold Ironhand']);
  assert.deepEqual(crumbs(parseHash('#/entity/g'), look)[1].href, '#/world/type-npc');
  assert.deepEqual(labels('#/entity/s'), ['World', 'Stubs', 'Pip']);
  assert.deepEqual(labels('#/world/type-npc'), ['World', 'NPCs']);
  assert.equal(crumbs(parseHash('#/world/type-npc'), look).at(-1).href, undefined, 'current page is not a link');
});

test('counts and dates', () => {
  assert.equal(count(1, 'note'), '1 note');
  assert.equal(count(2, 'entity', 'entities'), '2 entities');
  assert.equal(count(0, 'change'), '0 changes');
  const now = new Date(2026, 9, 1);
  assert.equal(when(new Date(2026, 8, 26, 21, 40).toISOString(), now), '26 Sep 21:40');
  assert.equal(when(new Date(2025, 0, 3, 9, 5).toISOString(), now), '3 Jan 2025 09:05');
});
