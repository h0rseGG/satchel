import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, search, searchQuery, looksLikeQuery, exactMatches } from '../../js/search.js';
import { makeEntity, makeNote, tombstone } from '../../js/model.js';
import { token } from '../../js/mentions.js';

const grim = makeEntity({ name: 'Grimbold', type: 'npc', summary: 'dwarf smith' });
const mira = makeEntity({ name: 'Mira Vane', type: 'npc', aliases: ['The Fox'] });
const notes = [
  makeNote({ text: `${token(grim)} owes us 20 gp` }),
  makeNote({ text: 'found a hidden vault under the mill' }),
  makeNote({ text: `${token(mira)} knows about the vault` }),
];
const ents = [grim, mira];
const idx = buildIndex(notes, ents);
const refs = (q) => search(idx, q).map((r) => `${r.kind}:${r.ref}`);

test('finds notes by word and by prefix', () => {
  assert.ok(refs('vault').includes(`note:${notes[1].id}`));
  assert.ok(refs('vau').includes(`note:${notes[1].id}`));
});

test('tolerates a typo', () => {
  assert.ok(refs('grimbld').includes(`entity:${grim.id}`));
});

test('tolerates swapped letters in longer words, not in short ones', () => {
  assert.ok(refs('vualt').includes(`note:${notes[1].id}`));
  assert.deepEqual(refs('mlil'), [], '4 letters allow only 1 edit');
});

test('mentions are searchable by entity name', () => {
  assert.ok(refs('grimbold owes').includes(`note:${notes[0].id}`));
});

test('entity matches by alias and summary; name outranks text', () => {
  assert.equal(search(idx, 'fox')[0].ref, mira.id);
  assert.ok(refs('smith').includes(`entity:${grim.id}`));
  assert.equal(search(idx, 'grimbold')[0].kind, 'entity');
});

test('deleted records are not indexed', () => {
  const gone = tombstone(makeNote({ text: 'secret tunnel' }));
  assert.deepEqual(search(buildIndex([gone], []), 'tunnel'), []);
});

test('empty query returns nothing', () => {
  assert.deepEqual(search(idx, '   '), []);
});

test('searchQuery and looksLikeQuery', () => {
  assert.equal(searchQuery('@Lord_Aldric  mill'), 'Lord Aldric mill');
  assert.equal(looksLikeQuery('grimbold'), true);
  assert.equal(looksLikeQuery('one two three four'), true);
  assert.equal(looksLikeQuery('one two three four five'), false);
  assert.equal(looksLikeQuery('   '), false);
});

test('exactMatches: whole words only, aliases, typed form, newest first', () => {
  const al = makeEntity({ name: 'Al', type: 'npc' });
  const lord = makeEntity({ name: 'Lord Aldric', type: 'npc' });
  const all = [grim, mira, al, lord];
  assert.deepEqual(exactMatches('the alder tree', all), []);
  assert.deepEqual(exactMatches('asked the fox', all), [mira]);
  assert.deepEqual(exactMatches('met @Lord_Aldric', all), [lord]);
  assert.deepEqual(exactMatches('Grimbold then Al', all), [al, grim]);
});

test('exactMatches: excludes given ids and caps at limit', () => {
  const pc = makeEntity({ name: 'Kael', type: 'character' });
  assert.deepEqual(exactMatches('Kael and Grimbold', [pc, grim], { excludeIds: [pc.id] }), [grim]);
  const many = ['A1', 'B2', 'C3', 'D4'].map((n) => makeEntity({ name: n }));
  assert.equal(exactMatches('A1 B2 C3 D4', many).length, 3);
});

test('exactMatches: names with regex characters are safe', () => {
  const odd = makeEntity({ name: 'Mr. (Q)' });
  assert.deepEqual(exactMatches('saw mr. (q) today', [odd]), [odd]);
});

test('performance: 5000 notes index and search quickly', () => {
  const many = Array.from({ length: 5000 }, (_, i) =>
    makeNote({ text: `session note ${i} about ${token(grim)} and the vault number ${i % 97}` }));
  const t0 = performance.now();
  const big = buildIndex(many, ents);
  const t1 = performance.now();
  const hits = search(big, 'vault grim');
  const t2 = performance.now();
  console.log(`  build ${(t1 - t0).toFixed(0)} ms, search ${(t2 - t1).toFixed(1)} ms`);
  assert.ok(hits.length > 0);
  assert.ok(t1 - t0 < 2000, 'index build under 2 s');
  assert.ok(t2 - t1 < 100, 'search under 100 ms');
});
