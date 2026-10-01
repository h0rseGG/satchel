import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeData, redirectMap } from '../../js/merge.js';
import { makeEntity, makeNote, makeRelationship, touch, tombstone } from '../../js/model.js';
import { token } from '../../js/mentions.js';

const T1 = '2026-10-01T01:00:00.000Z';
const T2 = '2026-10-01T02:00:00.000Z';
const T3 = '2026-10-01T03:00:00.000Z';
const AT = '2026-10-01T09:00:00.000Z';

const at = (rec, t) => ({ ...rec, created_at: t, updated_at: t });
const empty = () => ({ entities: [], notes: [], sessions: [], relationships: [], images: [] });
const side = (parts) => ({ ...empty(), ...parts });
const live = (rs) => rs.filter((r) => !r.deleted);

test('adds records only the kit has', () => {
  const n = makeNote({ text: 'from phone' });
  const { tables, writes, report } = mergeData(empty(), side({ notes: [n] }), AT);
  assert.deepEqual(tables.notes, [n]);
  assert.deepEqual(writes.notes, [n]);
  assert.equal(report.added, 1);
});

test('same id: newer wins, older keeps local, tie keeps local', () => {
  const base = at(makeNote({ text: 'v1' }), T1);
  const newer = touch(base, { text: 'v2' }, T2);
  const older = touch(base, { text: 'v0' }, T1);

  let r = mergeData(side({ notes: [base] }), side({ notes: [newer] }), AT);
  assert.equal(r.tables.notes[0].text, 'v2');
  assert.equal(r.report.updated, 1);

  r = mergeData(side({ notes: [newer] }), side({ notes: [base] }), AT);
  assert.equal(r.tables.notes[0].text, 'v2');
  assert.equal(r.report.keptLocal, 1);
  assert.deepEqual(r.writes.notes, []);

  r = mergeData(side({ notes: [base] }), side({ notes: [older] }), AT);
  assert.equal(r.tables.notes[0].text, 'v1', 'tie keeps local');
  assert.equal(r.report.unchanged, 1);
});

test('deletion on one side wins if newer; a later edit resurrects', () => {
  const n = at(makeNote({ text: 'x' }), T1);
  const deleted = tombstone(n, T2);
  const editedLater = touch(n, { text: 'y' }, T3);
  assert.equal(mergeData(side({ notes: [n] }), side({ notes: [deleted] }), AT).tables.notes[0].deleted, true);
  const r = mergeData(side({ notes: [deleted] }), side({ notes: [editedLater] }), AT);
  assert.equal(r.tables.notes[0].deleted, false);
  assert.equal(r.tables.notes[0].text, 'y');
});

test('merging a kit into itself writes nothing', () => {
  const d = side({ entities: [makeEntity({ name: 'A', type: 'npc' })], notes: [makeNote({ text: 'n' })] });
  const { writes, report } = mergeData(d, structuredClone(d), AT);
  for (const t of Object.keys(writes)) assert.deepEqual(writes[t], [], t);
  assert.equal(report.unchanged, 2);
});

function twoDevices() {
  // Phone and PC each typed @Grimbold before merging: two separate stubs.
  const phoneStub = at(makeEntity({ name: 'Grimbold' }), T1);
  const pcStub = at(makeEntity({ name: 'grimbold' }), T2);
  const phoneNote = at(makeNote({ text: `met ${token(phoneStub)}`, mentions: [phoneStub.id] }), T1);
  const pcNote = at(makeNote({ text: `paid ${token(pcStub)}`, mentions: [pcStub.id] }), T2);
  return {
    phone: side({ entities: [phoneStub], notes: [phoneNote] }),
    pc: side({ entities: [pcStub], notes: [pcNote] }),
    phoneStub, pcStub,
  };
}

test('duplicate stubs combine into the older one; notes are re-pointed', () => {
  const { phone, pc, phoneStub, pcStub } = twoDevices();
  const { tables, report } = mergeData(pc, phone, AT);
  assert.equal(report.stubsCombined, 1);
  assert.deepEqual(live(tables.entities).map((e) => e.id), [phoneStub.id]);
  const loser = tables.entities.find((e) => e.id === pcStub.id);
  assert.equal(loser.deleted, true);
  assert.equal(loser.merged_into, phoneStub.id);
  for (const n of tables.notes) {
    assert.deepEqual(n.mentions, [phoneStub.id]);
    assert.ok(n.text.includes(`(${phoneStub.id})`));
    assert.ok(!n.text.includes(pcStub.id));
  }
});

test('both devices merging each other pick the same survivor', () => {
  const { phone, pc } = twoDevices();
  const onPc = mergeData(pc, phone, AT).tables;
  const onPhone = mergeData(phone, pc, AT).tables;
  assert.deepEqual(live(onPc.entities).map((e) => e.id), live(onPhone.entities).map((e) => e.id));
  // ...and merging the results back and forth settles with nothing left to do.
  const again = mergeData(onPc, onPhone, AT);
  assert.equal(again.report.stubsCombined, 0);
  assert.deepEqual(live(again.tables.entities).map((e) => e.id), live(onPc.entities).map((e) => e.id));
});

test('a late kit still mentioning a merged-away stub is redirected', () => {
  const { phone, pc, phoneStub, pcStub } = twoDevices();
  const onPc = mergeData(pc, phone, AT).tables;
  // The PC's stub lost. A kit packed elsewhere before that merge still has a
  // newer note mentioning the losing stub; it must land on the survivor.
  const lateNote = at(makeNote({ text: `again ${token(pcStub)}`, mentions: [pcStub.id] }), T3);
  const late = side({ entities: [pcStub], notes: [lateNote] });
  const { tables } = mergeData(onPc, late, AT);
  const n = tables.notes.find((x) => x.id === lateNote.id);
  assert.deepEqual(n.mentions, [phoneStub.id]);
  assert.deepEqual(live(tables.entities).map((e) => e.id), [phoneStub.id]);
});

test('real (non-stub) entities with the same name are not combined', () => {
  const a = at(makeEntity({ name: 'Twin', type: 'npc' }), T1);
  const b = at(makeEntity({ name: 'Twin', type: 'npc' }), T2);
  const { tables, report } = mergeData(side({ entities: [a] }), side({ entities: [b] }), AT);
  assert.equal(report.stubsCombined, 0);
  assert.equal(live(tables.entities).length, 2);
});

test('a stub folds into the one real entity with that name, even if the stub is older', () => {
  const stub = at(makeEntity({ name: 'mira' }), T1);
  const real = at(makeEntity({ name: 'Mira', type: 'npc' }), T2);
  const note = at(makeNote({ text: `saw ${token(stub)}`, mentions: [stub.id] }), T1);
  for (const [a, b] of [[side({ entities: [real] }), side({ entities: [stub], notes: [note] })],
    [side({ entities: [stub], notes: [note] }), side({ entities: [real] })]]) {
    const { tables, report } = mergeData(a, b, AT);
    assert.equal(report.stubsCombined, 1);
    assert.deepEqual(live(tables.entities).map((e) => e.id), [real.id]);
    assert.deepEqual(tables.notes[0].mentions, [real.id]);
  }
});

test('typed as npc on one device, still a stub on the other: one entity after syncing both ways', () => {
  const phoneStub = at(makeEntity({ name: 'Grimbold' }), T1);
  const pcStub = at(makeEntity({ name: 'Grimbold' }), T2);
  const phoneTyped = touch(phoneStub, { type: 'npc', stub: false }, T3);
  const onPc = mergeData(side({ entities: [pcStub] }), side({ entities: [phoneTyped] }), AT).tables;
  const onPhone = mergeData(side({ entities: [phoneTyped] }), side({ entities: [pcStub] }), AT).tables;
  assert.deepEqual(live(onPc.entities).map((e) => [e.id, e.type]), [[phoneStub.id, 'npc']]);
  assert.deepEqual(live(onPhone.entities).map((e) => [e.id, e.type]), [[phoneStub.id, 'npc']]);
});

test('two real entities with the same name: a stub is left alone (ambiguous)', () => {
  const a = at(makeEntity({ name: 'Guard', type: 'npc' }), T1);
  const b = at(makeEntity({ name: 'Guard', type: 'npc' }), T2);
  const stub = at(makeEntity({ name: 'guard' }), T3);
  const { tables, report } = mergeData(side({ entities: [a, b] }), side({ entities: [stub] }), AT);
  assert.equal(report.stubsCombined, 0);
  assert.equal(live(tables.entities).length, 3);
});

test('relationships are rewired to the survivor', () => {
  const { phone, pc, phoneStub, pcStub } = twoDevices();
  const pcChar = at(makeEntity({ name: 'Kael', type: 'character' }), T1);
  const rel = at(makeRelationship({ from_id: pcChar.id, to_id: pcStub.id, type: 'owes', directed: true }), T2);
  pc.entities.push(pcChar);
  pc.relationships.push(rel);
  const { tables } = mergeData(pc, phone, AT);
  assert.equal(tables.relationships[0].to_id, phoneStub.id);
  assert.equal(tables.relationships[0].updated_at, AT);
});

test('redirectMap follows chains', () => {
  const ents = [
    { id: 'a', merged_into: 'b' },
    { id: 'b', merged_into: 'c' },
    { id: 'c', merged_into: null },
  ];
  assert.deepEqual([...redirectMap(ents)], [['a', 'c'], ['b', 'c']]);
});
