import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeEntity, makeNote, makeSession, makeRelationship,
  editNote, tombstone, touch, cleanName, nameKey, live, ENTITY_TYPES, setType, withEntityDefaults, directedByDefault,
} from '../../js/model.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('every record gets id, timestamps and deleted=false', () => {
  for (const rec of [
    makeEntity({ name: 'Grimbold' }),
    makeNote({ text: 'hello' }),
    makeSession({ number: 1 }),
    makeRelationship({ from_id: 'a', to_id: 'b', type: 'ally' }),
  ]) {
    assert.match(rec.id, UUID);
    assert.match(rec.created_at, ISO);
    assert.equal(rec.updated_at, rec.created_at);
    assert.equal(rec.deleted, false);
  }
});

test('ids are unique across many records', () => {
  const ids = new Set(Array.from({ length: 10000 }, () => makeNote({ text: 'x' }).id));
  assert.equal(ids.size, 10000);
});

test('entity: defaults to unknown stub, cleans name and aliases', () => {
  const e = makeEntity({ name: '  Lord   Aldric ', aliases: [' Al ', ''] });
  assert.equal(e.name, 'Lord Aldric');
  assert.deepEqual(e.aliases, ['Al']);
  assert.equal(e.type, 'unknown');
  assert.equal(e.stub, true);
  assert.equal(e.merged_into, null);
});

test('entity: typed entity is not a stub by default; item type exists', () => {
  assert.ok(ENTITY_TYPES.includes('item'));
  assert.equal(makeEntity({ name: 'Sword', type: 'item' }).stub, false);
});

test('tags: cleaned, # dropped, deduped ignoring case, first spelling kept', () => {
  const e = makeEntity({ name: 'Grimbold', tags: [' Shopkeeper ', '#dwarf', 'shopkeeper', '', 'owes  us'] });
  assert.deepEqual(e.tags, ['Shopkeeper', 'dwarf', 'owes us']);
  assert.deepEqual(makeEntity({ name: 'X' }).tags, []);
});

test('setType makes a stub real; unknown and bad types are refused', () => {
  const stub = makeEntity({ name: 'Grimbold' });
  const npc = setType(stub, 'npc', '2030-01-01T00:00:00.000Z');
  assert.equal(npc.type, 'npc');
  assert.equal(npc.stub, false);
  assert.equal(npc.updated_at, '2030-01-01T00:00:00.000Z');
  assert.equal(stub.stub, true, 'input not mutated');
  assert.throws(() => setType(stub, 'unknown'));
  assert.throws(() => setType(stub, 'dragon'));
});

test('withEntityDefaults fills fields older records lack', () => {
  const old = { id: 'x', name: 'Old', type: 'npc' };
  assert.deepEqual(withEntityDefaults(old).tags, []);
  assert.deepEqual(withEntityDefaults({ ...old, tags: ['a'] }).tags, ['a']);
});

test('entity: rejects empty name and bad type', () => {
  assert.throws(() => makeEntity({ name: '   ' }));
  assert.throws(() => makeEntity({ name: 'X', type: 'dragon' }));
});

test('names: emoji and non-English survive cleaning', () => {
  assert.equal(cleanName(' Zoë  🐉 '), 'Zoë 🐉');
  assert.equal(nameKey('ÉLODIE'), 'élodie');
});

test('note: trims text, dedupes mentions, starts un-triaged', () => {
  const n = makeNote({ text: '  met @Grim  ', mentions: ['a', 'a', 'b'] });
  assert.equal(n.text, 'met @Grim');
  assert.deepEqual(n.mentions, ['a', 'b']);
  assert.equal(n.triaged_at, null);
  assert.equal(n.original_text, null);
});

test('note: rejects empty text and unknown modes', () => {
  assert.throws(() => makeNote({ text: '  ' }));
  assert.throws(() => makeNote({ text: 'x', mode: 'sideways' }));
});

test('note: in-session without a session record is fine', () => {
  const n = makeNote({ text: 'x', mode: 'in' });
  assert.equal(n.mode, 'in');
  assert.equal(n.session_id, null);
});

test('note: out-of-session ignores a stray session_id', () => {
  assert.equal(makeNote({ text: 'x', mode: 'out', session_id: 's1' }).session_id, null);
});

test('note: very long text is kept intact', () => {
  const long = 'a'.repeat(100000);
  assert.equal(makeNote({ text: long }).text.length, 100000);
});

test('editNote keeps the first original_text across several edits', () => {
  const n0 = makeNote({ text: 'first' });
  const n1 = editNote(n0, 'second', '2030-01-01T00:00:00.000Z');
  const n2 = editNote(n1, 'third', '2030-01-02T00:00:00.000Z');
  assert.equal(n2.text, 'third');
  assert.equal(n2.original_text, 'first');
  assert.equal(n2.updated_at, '2030-01-02T00:00:00.000Z');
  assert.equal(n0.text, 'first', 'input not mutated');
});

test('editNote with unchanged text is a no-op', () => {
  const n = makeNote({ text: 'same' });
  assert.equal(editNote(n, ' same '), n);
});

test('tombstone and touch bump updated_at without mutating', () => {
  const e = makeEntity({ name: 'X' });
  const t = tombstone(e, '2030-01-01T00:00:00.000Z');
  assert.equal(t.deleted, true);
  assert.equal(t.updated_at, '2030-01-01T00:00:00.000Z');
  assert.equal(e.deleted, false);
  assert.equal(touch(e, { summary: 's' }).summary, 's');
});

test('live() drops tombstones', () => {
  const a = makeNote({ text: 'a' });
  const b = tombstone(makeNote({ text: 'b' }));
  assert.deepEqual(live([a, b]), [a]);
});

test('session: needs a positive integer number', () => {
  const s = makeSession({ number: 3 });
  assert.equal(s.started_at, s.created_at);
  assert.equal(s.ended_at, null);
  assert.throws(() => makeSession({ number: 0 }));
  assert.throws(() => makeSession({ number: 1.5 }));
});

test('directedByDefault: known types, case-insensitive; unknown types default to one-way', () => {
  assert.equal(directedByDefault('Ally'), false);
  assert.equal(directedByDefault('owes'), true);
  assert.equal(directedByDefault(' member  of '), true);
  assert.equal(directedByDefault('sworn to protect'), true);
});

test('relationship: validates ends and type', () => {
  assert.throws(() => makeRelationship({ from_id: 'a', to_id: 'a', type: 'ally' }));
  assert.throws(() => makeRelationship({ from_id: 'a', type: 'ally' }));
  assert.throws(() => makeRelationship({ from_id: 'a', to_id: 'b', type: ' ' }));
  assert.equal(makeRelationship({ from_id: 'a', to_id: 'b', type: 'owes', directed: true }).directed, true);
});
