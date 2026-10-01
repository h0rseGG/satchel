import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIndex, indexRecords, search, maxEdits, shouldSearch, removeRecord } from '../../js/core/search.js';
import { makeRecord } from '../../js/core/model.js';
import { addField } from '../../js/core/types.js';
import { ent, types } from './helpers.js';

const note = (id, text, tags = []) => makeRecord('notes', { text, tags }, { id, now: '2026-09-01T00:00:00.000Z' });

test('typo tolerance by length: 0 for <=3 letters, 1 for 4, 2 for 5+', () => {
  assert.deepEqual(['ox', 'inn', 'mira', 'aldric'].map(maxEdits), [0, 0, 1, 2]);
});

test('short text (<=4 words) runs search', () => {
  assert.equal(shouldSearch('lord aldric'), true);
  assert.equal(shouldSearch('one two three four five'), false);
  assert.equal(shouldSearch('   '), false);
});

function setup() {
  const deity = addField({ ...types.find((t) => t.id === 'type-other'), id: 'type-deity', fields: [] }, { label: 'Domain', kind: 'text' }, { id: 'f-domain' });
  const mira = ent('Mira Vane', { aliases: ['The Fox'], tags: ['fence'], summary: 'Knew mum' });
  const god = ent('Auril', { type_id: 'type-deity', fields: { 'f-domain': 'winter frost' } });
  const notes = [
    note('n1', `@[mira](${mira.id}) says Lyra is ALIVE`, ['lyra']),
    note('n2', 'paid grimbold 20gp #debts', ['debts']),
    note('n3', 'the mill smells of brimstone'),
    { ...note('n4', 'deleted brimstone note'), deleted: true },
  ];
  const typesById = new Map([...types, deity].map((t) => [t.id, t]));
  return { mira, god, index: indexRecords(createIndex(), { notes, entities: [mira, god], typesById }) };
}

test('finds notes by text, mentions (current names) and tags; entities by name, alias, tag, fields', () => {
  const { index, mira, god } = setup();
  const refs = (q, kind) => search(index, q, { kind }).map((r) => r.ref);
  assert.deepEqual(refs('vane', 'note'), ['n1'], 'mention shows current name');
  assert.ok(refs('debts').includes('n2'));
  assert.deepEqual(refs('brimstone'), ['n3'], 'deleted notes not indexed');
  assert.equal(refs('fox')[0], mira.id);
  assert.ok(refs('fence').includes(mira.id));
  assert.ok(refs('frost').includes(god.id));
});

test('prefix and typos', () => {
  const { index } = setup();
  const refs = (q) => search(index, q).map((r) => r.ref);
  assert.ok(refs('brim').includes('n3'), 'prefix');
  assert.ok(refs('brimstoen').includes('n3'), '2 edits for a 9-letter word (swap = 2)');
  assert.ok(refs('grimbld').includes('n2'), '1 deletion');
  assert.deepEqual(refs('mil'), ['n3'], '3 letters: prefix only, no typos');
  assert.deepEqual(refs('mxl'), [], '3 letters: no edits');
});

test('all words must match', () => {
  const { index } = setup();
  assert.deepEqual(search(index, 'lyra alive').map((r) => r.ref), ['n1']);
  assert.deepEqual(search(index, 'lyra brimstone'), []);
});

test('re-indexing replaces; removing works', () => {
  const { index } = setup();
  indexRecords(index, { notes: [note('n3', 'now about cheese')] });
  assert.deepEqual(search(index, 'brimstone'), []);
  removeRecord(index, 'note', 'n3');
  assert.deepEqual(search(index, 'cheese'), []);
});

test('speed: 5000 notes index and search well inside the bar (SPEC 10: search < 50 ms)', () => {
  const words = 'goblin mill river lord aldric grimbold debt cargo hollow king sister caldra wren lyra ship storm'.split(' ');
  const notes = Array.from({ length: 5000 }, (_, i) => note(`p${i}`, Array.from({ length: 12 }, (_, j) => words[(i * 7 + j * 3) % words.length]).join(' ') + ` note${i}`));
  const t0 = performance.now();
  const index = indexRecords(createIndex(), { notes });
  const tIndex = performance.now() - t0;
  const t1 = performance.now();
  for (const q of ['grim', 'hollow king', 'caldar', 'storm ship']) search(index, q);
  const tSearch = (performance.now() - t1) / 4;
  assert.ok(tSearch < 50, `search took ${tSearch.toFixed(1)} ms`);
  assert.ok(tIndex < 2000, `index took ${tIndex.toFixed(0)} ms`);
});
