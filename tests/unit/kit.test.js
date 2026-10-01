import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8, unzipSync, strFromU8 } from '../../vendor/fflate.mjs';
import { packKit, unpackKit, kitFilename, slug, SCHEMA_VERSION } from '../../js/core/kit.js';
import { makeRecord, makePcEntity } from '../../js/core/model.js';
import { builtinTypes } from '../../js/core/types.js';

const NOW = new Date('2026-10-01T11:30:00.000Z');
const T = '2026-09-01T00:00:00.000Z';

function sample() {
  const pc = makePcEntity('Wren Ashdown', { id: 'pc', now: T });
  const mira = makeRecord('entities', { name: 'Mira', type_id: 'type-npc' }, { id: 'mira', now: T });
  const img = makeRecord('files', { name: 'map', kind: 'image', mime: 'image/webp', size: 3, entity_id: 'mira' }, { id: 'f1', now: T });
  const gone = makeRecord('files', { name: 'old', kind: 'text', mime: 'text/plain', size: 2, deleted: true }, { id: 'f2', now: T });
  const notes = [
    makeRecord('notes', { text: 'second' }, { id: 'n2', now: '2026-09-02T00:00:00.000Z' }),
    makeRecord('notes', { text: 'first @[Mira](mira)' }, { id: 'n1', now: T }),
    { ...makeRecord('notes', { text: 'dead' }, { id: 'n3', now: T }), deleted: true },
  ];
  const bundle = { bundle_id: 'b1', pc_entity_id: 'pc', entities: [mira, pc], types: builtinTypes(), notes, relationships: [], files: [img, gone] };
  const blobs = new Map([['f1', new Uint8Array([1, 2, 3])], ['f2', new Uint8Array([9, 9])]]);
  return { bundle, blobs };
}

const zip = (files) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
const charJson = (over = {}) => JSON.stringify({ format: 'satchel', schema_version: 3, bundle_id: 'b1', pc_entity_id: 'pc', entities: [{ id: 'pc', name: 'Wren' }], ...over });

test('filename: ASCII slug and local time', () => {
  assert.equal(slug('Zoë  Ashdown-Brûlé!'), 'zoe-ashdown-brule');
  assert.equal(slug('日本'), 'character');
  const d = new Date(2026, 9, 1, 21, 30);
  assert.equal(kitFilename('Kael', d), 'kael-2026-10-01-2130.kit');
});

test('round trip keeps every record, tombstones included; bytes only for live files', () => {
  const { bundle, blobs } = sample();
  const { bytes, filename, exported_at } = packKit(bundle, blobs, { now: NOW });
  assert.match(filename, /^wren-ashdown-2026-10-0\d-\d{4}\.kit$/);
  const files = unzipSync(bytes);
  assert.deepEqual(Object.keys(files).sort(), ['character.json', 'files/f1.webp', 'notes.jsonl']);
  const r = unpackKit(bytes);
  assert.equal(r.ok, true);
  assert.equal(r.bundle.exported_at, exported_at);
  assert.deepEqual(r.bundle.notes.map((n) => n.id).sort(), ['n1', 'n2', 'n3']);
  assert.deepEqual([...r.blobs.keys()], ['f1']);
  assert.deepEqual([...r.blobs.get('f1')], [1, 2, 3]);
  assert.deepEqual(r.report, { skippedNoteLines: 0, duplicates: 0, droppedRecords: 0, ignoredPaths: 0, missingFiles: 0 });
  const byId = (a, b) => (a.id < b.id ? -1 : 1);
  assert.deepEqual([...r.bundle.entities].sort(byId), [...bundle.entities].sort(byId));
});

test('canonical: same data in any order gives the same bytes', () => {
  const a = sample();
  const b = sample();
  b.bundle.entities.reverse();
  b.bundle.notes.reverse();
  b.bundle.entities[0] = Object.fromEntries(Object.entries(b.bundle.entities[0]).reverse());
  assert.deepEqual(packKit(a.bundle, a.blobs, { now: NOW }).bytes, packKit(b.bundle, b.blobs, { now: NOW }).bytes);
});

test('notes.jsonl: one note per line, oldest first; character.json has sorted keys', () => {
  const { bundle, blobs } = sample();
  const f = unzipSync(packKit(bundle, blobs, { now: NOW }).bytes);
  const lines = strFromU8(f['notes.jsonl']).trim().split('\n').map((l) => JSON.parse(l).id);
  assert.deepEqual(lines, ['n1', 'n3', 'n2']);
  const doc = JSON.parse(strFromU8(f['character.json']));
  assert.deepEqual(Object.keys(doc), [...Object.keys(doc)].sort());
  assert.equal(doc.schema_version, SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, 3);
});

test('refusals', () => {
  assert.equal(unpackKit(strToU8('not a zip')).error, 'not-zip');
  assert.equal(unpackKit(zip({ 'other.txt': 'x' })).error, 'no-character');
  assert.equal(unpackKit(zip({ 'character.json': '{oops' })).error, 'bad-json');
  assert.equal(unpackKit(zip({ 'character.json': charJson({ format: 'other' }) })).error, 'wrong-format');
  assert.equal(unpackKit(zip({ 'character.json': charJson({ schema_version: 4 }) })).error, 'newer');
  assert.equal(unpackKit(zip({ 'character.json': charJson({ schema_version: 2 }) })).error, 'v1-kit');
  assert.equal(unpackKit(zip({ 'character.json': charJson({ schema_version: '3' }) })).error, 'bad-kit');
  assert.equal(unpackKit(zip({ 'character.json': charJson({ bundle_id: '' }) })).error, 'bad-kit');
  assert.equal(unpackKit(zip({ 'character.json': charJson({ entities: {} }) })).error, 'bad-kit');
  assert.equal(unpackKit(zip({ 'character.json': charJson({ pc_entity_id: 'nope' }) })).error, 'bad-kit');
});

test('bad note lines skipped and reported; duplicates keep the newest; missing fields get defaults', () => {
  const notes = [
    JSON.stringify({ id: 'n1', text: 'old', updated_at: '2026-01-01T00:00:00.000Z' }),
    '{broken',
    '[1,2]',
    JSON.stringify({ id: 'n1', text: 'new', updated_at: '2026-02-01T00:00:00.000Z' }),
    JSON.stringify({ text: 'no id' }),
    '',
  ].join('\n');
  const r = unpackKit(zip({ 'character.json': charJson(), 'notes.jsonl': notes }));
  assert.equal(r.ok, true);
  assert.equal(r.report.skippedNoteLines, 2);
  assert.equal(r.report.duplicates, 1);
  assert.equal(r.report.droppedRecords, 1);
  assert.equal(r.bundle.notes.length, 1);
  const n = r.bundle.notes[0];
  assert.equal(n.text, 'new');
  assert.deepEqual([n.mentions, n.tags, n.mode, n.triaged_at, n.deleted], [[], [], 'out', null, false]);
  const pc = r.bundle.entities[0];
  assert.deepEqual([pc.aliases, pc.fields, pc.stub], [[], {}, false]);
  assert.ok(r.bundle.types.some((t) => t.id === 'type-npc'), 'built-ins added when missing');
});

test('unknown and ../ paths ignored; only files/<id>.<ext> of live file records', () => {
  const r = unpackKit(zip({
    'character.json': charJson({ files: [{ id: 'f1', mime: 'image/webp', updated_at: 'x' }, { id: 'f2', mime: 'text/plain', deleted: true }] }),
    'files/f1.webp': new Uint8Array([1]),
    'files/f2.txt': 'tomb',
    'files/../../evil.js': 'x',
    'files/f1.jpg': new Uint8Array([2]),
    'readme.txt': 'hi',
  }));
  assert.equal(r.ok, true);
  assert.deepEqual([...r.blobs.keys()], ['f1']);
  assert.equal(r.report.ignoredPaths, 4);
});

test('missing bytes for a live file are reported', () => {
  const r = unpackKit(zip({ 'character.json': charJson({ files: [{ id: 'f1', mime: 'image/webp' }] }) }));
  assert.equal(r.report.missingFiles, 1);
});

test('import modes: new when empty, merge for the same character, replace always', async () => {
  const { importModes } = await import('../../js/core/kit.js');
  assert.deepEqual(importModes(null, 'b1'), ['new']);
  assert.deepEqual(importModes('b1', 'b1'), ['merge', 'replace']);
  assert.deepEqual(importModes('b1', 'b2'), ['replace']);
});

// Fixtures are frozen copies, kept forever, so every future Satchel still opens old kits.
test('fixture schema-3.kit still unpacks', () => {
  const r = unpackKit(readFileSync(new URL('../fixtures/schema-3.kit', import.meta.url)));
  assert.equal(r.ok, true);
  assert.equal(r.bundle.notes.length, 47);
});
