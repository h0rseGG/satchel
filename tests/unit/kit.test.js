import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8, strFromU8 } from '../../vendor/fflate.mjs';
import { packKit, unpackKit, kitFilename, kitFiles, KitError, FORMAT } from '../../js/kit.js';
import { makeEntity, makeNote, makeSession, makeRelationship, tombstone, newId, SCHEMA_VERSION } from '../../js/model.js';

function sample() {
  const pc = makeEntity({ name: 'Kael', type: 'character' });
  const grim = makeEntity({ name: 'Grimbold', type: 'npc' });
  const gone = tombstone(makeEntity({ name: 'Typo' }));
  const s1 = makeSession({ number: 1 });
  return {
    bundle_id: newId(),
    pc_entity_id: pc.id,
    entities: [pc, grim, gone],
    notes: [makeNote({ text: 'first' }), tombstone(makeNote({ text: 'deleted' })), makeNote({ text: 'emoji 🐉 ok' })],
    sessions: [s1],
    relationships: [makeRelationship({ from_id: pc.id, to_id: grim.id, type: 'ally' })],
    images: [],
  };
}

const files = (bytes) => Object.keys(unzipSync(bytes)).sort();

// Build a zip by hand, for malformed-kit tests.
function zip(entries) {
  return zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
}
const manifest = (extra = {}) => JSON.stringify({ format: FORMAT, schema_version: 1, bundle_id: 'b1', entities: [], ...extra });

test('round trip: pack then unpack gives the same data, tombstones included', () => {
  const d = sample();
  const { data, report } = unpackKit(packKit(d, '2026-10-01T11:30:00.000Z'));
  assert.equal(data.bundle_id, d.bundle_id);
  assert.equal(data.pc_entity_id, d.pc_entity_id);
  assert.equal(data.exported_at, '2026-10-01T11:30:00.000Z');
  assert.equal(data.schema_version, SCHEMA_VERSION);
  for (const t of ['entities', 'sessions', 'relationships', 'images']) assert.deepEqual(data[t], d[t], t);
  assert.deepEqual(new Set(data.notes.map((n) => n.id)), new Set(d.notes.map((n) => n.id)));
  assert.ok(data.notes.some((n) => n.deleted), 'tombstoned note kept');
  assert.equal(data.notes.find((n) => n.text.includes('🐉')).text, 'emoji 🐉 ok');
  assert.deepEqual(report, { skipped: [], duplicates: 0, migratedFrom: null });
});

test('same data, different field order: identical kit files (no phantom sync changes)', () => {
  const d = sample();
  const shuffled = structuredClone(d);
  const reverseKeys = (o) => Object.fromEntries(Object.entries(o).reverse());
  for (const t of ['entities', 'notes', 'sessions', 'relationships']) shuffled[t] = shuffled[t].map(reverseKeys);
  const a = kitFiles(d, '2026-10-01T00:00:00.000Z');
  const b = kitFiles(shuffled, '2026-10-01T00:00:00.000Z');
  assert.deepEqual(a, b);
});

test('a record that went through unpack packs to the same bytes as the original', () => {
  const d = sample();
  const first = kitFiles(d, '2026-10-01T00:00:00.000Z');
  const { data } = unpackKit(packKit(d, '2026-10-01T00:00:00.000Z'));
  assert.deepEqual(kitFiles(data, '2026-10-01T00:00:00.000Z'), first);
});

test('kit holds only character.json and notes.jsonl when there are no images', () => {
  assert.deepEqual(files(packKit(sample())), ['character.json', 'notes.jsonl']);
});

test('character.json is readable and has the format marker; notes are one per line', () => {
  const raw = unzipSync(packKit(sample()));
  const c = JSON.parse(strFromU8(raw['character.json']));
  assert.equal(c.format, 'satchel');
  assert.equal(c.schema_version, SCHEMA_VERSION);
  assert.ok(!('notes' in c), 'notes live in notes.jsonl');
  const lines = strFromU8(raw['notes.jsonl']).trimEnd().split('\n');
  assert.equal(lines.length, 3);
  lines.forEach((l) => JSON.parse(l));
});

test('images are stored under images/<id>.webp and come back byte-identical', () => {
  const id = newId();
  const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
  const d = { ...sample(), imageFiles: new Map([[id, bytes]]) };
  const packed = packKit(d);
  assert.ok(files(packed).includes(`images/${id}.webp`));
  assert.deepEqual(unpackKit(packed).data.imageFiles.get(id), bytes);
});

test('kitFilename: slug plus local timestamp, .kit extension', () => {
  const at = new Date(2026, 9, 1, 21, 5);
  assert.equal(kitFilename('Lord Aldric', at), 'lord-aldric-2026-10-01-2105.kit');
  assert.equal(kitFilename('Zoë 🐉', at), 'zoe-2026-10-01-2105.kit');
  assert.equal(kitFilename('🐉', at), 'character-2026-10-01-2105.kit');
});

test('rejects a file that is not a zip', () => {
  assert.throws(() => unpackKit(strToU8('just some text')), KitError);
});

test('rejects a zip without character.json', () => {
  assert.throws(() => unpackKit(zip({ 'notes.jsonl': '' })), /no character.json/);
});

test('rejects damaged JSON, wrong format, and missing bundle id', () => {
  assert.throws(() => unpackKit(zip({ 'character.json': '{oops' })), /not valid JSON/);
  assert.throws(() => unpackKit(zip({ 'character.json': JSON.stringify({ format: 'other', schema_version: 1 }) })), /isn't a Satchel kit/);
  assert.throws(() => unpackKit(zip({ 'character.json': manifest({ bundle_id: '' }) })), /no bundle id/);
});

test('refuses a kit from a newer schema version', () => {
  assert.throws(() => unpackKit(zip({ 'character.json': manifest({ schema_version: SCHEMA_VERSION + 1 }) })), /newer Satchel/);
});

test('a bad line in notes.jsonl is skipped and reported, the rest load', () => {
  const good = JSON.stringify(makeNote({ text: 'ok' }));
  const { data, report } = unpackKit(zip({ 'character.json': manifest(), 'notes.jsonl': `${good}\n{broken\n` }));
  assert.equal(data.notes.length, 1);
  assert.deepEqual(report.skipped, ['notes.jsonl line 2: not valid JSON']);
});

test('duplicate ids: newest updated_at wins and is counted', () => {
  const e = makeEntity({ name: 'Old' });
  const newer = { ...e, name: 'New', updated_at: '2099-01-01T00:00:00.000Z' };
  const { data, report } = unpackKit(zip({ 'character.json': manifest({ entities: [newer, e] }) }));
  assert.equal(data.entities.length, 1);
  assert.equal(data.entities[0].name, 'New');
  assert.equal(report.duplicates, 1);
});

test('records without id or updated_at are skipped', () => {
  const { data, report } = unpackKit(zip({ 'character.json': manifest({ entities: [{ name: 'x' }] }) }));
  assert.equal(data.entities.length, 0);
  assert.equal(report.skipped.length, 1);
});

test('unexpected and path-traversal entries are ignored', () => {
  const { data } = unpackKit(zip({
    'character.json': manifest(),
    '../evil.js': 'alert(1)',
    'images/not-a-uuid.webp': new Uint8Array([1]),
    'extra.txt': 'hi',
  }));
  assert.equal(data.imageFiles.size, 0);
});
