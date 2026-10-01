import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentence, isDirected } from '../../js/core/relationships.js';

const names = { a: 'Lord Aldric Thorne', h: 'Hollow King', w: 'Wren Ashdown', l: 'Lyra Ashdown' };
const nameOf = (id) => names[id];

test('suggested types: both ways or one-way; unknown defaults to one-way', () => {
  assert.equal(isDirected({ type: 'ally' }), false);
  assert.equal(isDirected({ type: 'works for' }), true);
  assert.equal(isDirected({ type: 'sworn to' }), true);
  assert.equal(isDirected({ type: 'ally', directed: true }), true, 'the record wins');
});

test('sentences', () => {
  assert.equal(sentence({ from_id: 'a', to_id: 'h', type: 'works for' }, nameOf), 'Lord Aldric Thorne works for Hollow King');
  assert.equal(sentence({ from_id: 'w', to_id: 'l', type: 'family', directed: false }, nameOf), 'Wren Ashdown and Lyra Ashdown are family');
  assert.equal(sentence({ from_id: 'w', to_id: 'a', type: 'enemy' }, nameOf), 'Wren Ashdown and Lord Aldric Thorne are enemies');
});

test('diagram layout: centre plus up to 11 around it; the rest counted as hidden', async () => {
  const { layoutConnections } = await import('../../js/core/relationships.js');
  const rels = Array.from({ length: 14 }, (_, i) => ({ id: `r${i}`, from_id: i % 2 ? 'me' : `e${i}`, to_id: i % 2 ? `e${i}` : 'me', type: 'ally', updated_at: `2026-09-${String(10 + i).padStart(2, '0')}` }));
  rels.push({ id: 'dup', from_id: 'me', to_id: 'e13', type: 'owes', updated_at: '2026-09-01' });
  const l = layoutConnections('me', rels);
  assert.equal(l.nodes.length, 12);
  assert.deepEqual(l.nodes[0], { id: 'me', x: 180, y: 180, center: true });
  assert.equal(l.nodes[1].id, 'e13', 'most recent first');
  assert.deepEqual([l.nodes[1].x, l.nodes[1].y], [180, 50.4], 'first one at the top');
  assert.equal(l.hidden, 3);
  assert.equal(l.edges.filter((e) => e.from === 'me' && e.to === 'e13').length, 2, 'two relationships to one entity are two edges');
  for (const n of l.nodes) assert.ok(n.x >= 0 && n.x <= 360 && n.y >= 0 && n.y <= 360);
});
