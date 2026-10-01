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
