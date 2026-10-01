import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeBundles, redirectMerged } from '../../js/core/merge.js';
import { makeRecord, makePcEntity } from '../../js/core/model.js';
import { canonicalJson } from '../../js/core/json.js';

const t = (d) => `2026-09-${String(d).padStart(2, '0')}T00:00:00.000Z`;
const e = (id, name, d, extra = {}) => makeRecord('entities', { name, type_id: 'type-npc', ...extra }, { id, now: t(d) });
const note = (id, text, d, extra = {}) => makeRecord('notes', { text, ...extra }, { id, now: t(d) });
const bundle = (over) => ({ bundle_id: 'b', pc_entity_id: 'pc', entities: [], types: [], notes: [], relationships: [], files: [], ...over });

// Records as a canonical, order-free snapshot for comparing results.
const TABLES = ['entities', 'types', 'notes', 'relationships', 'files'];
const sorted = (rs) => [...rs].sort((x, y) => (x.id < y.id ? -1 : 1));
const snap = (b) => canonicalJson({ pc: b.pc_entity_id, ...Object.fromEntries(TABLES.map((k) => [k, sorted(b[k])])) });

function pair() {
  const pc = makePcEntity('Wren', { id: 'pc', now: t(1) });
  const A = bundle({
    entities: [pc, e('mira', 'Mira', 1), e('grim', 'Grim', 5, { summary: 'local edit' }), e('a-only', 'Only A', 2)],
    notes: [note('n1', 'hello', 1), note('n2', 'edited on A', 6)],
  });
  const B = bundle({
    entities: [pc, e('mira', 'Mira', 1), { ...e('grim', 'Grim', 4), summary: 'older' }, e('b-only', 'Only B', 3)],
    notes: [note('n1', 'hello', 1), { ...note('n2', 'deleted on B', 7), deleted: true }, note('n3', 'new on B', 3)],
  });
  return { A, B };
}

test('union by id, newest updated_at wins; report counts', () => {
  const { A, B } = pair();
  const { bundle: m, report } = mergeBundles(A, B);
  const by = (k, id) => m[k].find((r) => r.id === id);
  assert.equal(by('entities', 'grim').summary, 'local edit');
  assert.ok(by('entities', 'b-only') && by('entities', 'a-only'));
  assert.equal(by('notes', 'n2').deleted, true, 'newer deletion wins');
  assert.deepEqual(report, { added: 2, updated: 1, stubsCombined: 0 });
});

test('order-independent and idempotent', () => {
  const { A, B } = pair();
  const ab = mergeBundles(A, B).bundle;
  const ba = mergeBundles(B, A).bundle;
  assert.equal(snap(ab), snap(ba));
  const again = mergeBundles(ab, B);
  assert.equal(snap(again.bundle), snap(ab));
  assert.deepEqual(again.report, { added: 0, updated: 0, stubsCombined: 0 });
});

test('ties are settled by value, not by which side is local', () => {
  const a = bundle({ notes: [note('n', 'alpha', 5)] });
  const b = bundle({ notes: [note('n', 'beta', 5)] });
  assert.equal(mergeBundles(a, b).bundle.notes[0].text, mergeBundles(b, a).bundle.notes[0].text);
  const live = bundle({ notes: [note('n', 'x', 5)] });
  const dead = bundle({ notes: [{ ...note('n', 'x', 5), deleted: true }] });
  assert.equal(mergeBundles(live, dead).bundle.notes[0].deleted, true, 'a deletion wins a tie');
  assert.equal(mergeBundles(dead, live).bundle.notes[0].deleted, true);
});

test('profile merges per section', () => {
  const base = makePcEntity('Wren', { id: 'pc', now: t(1) });
  const a = { ...base, updated_at: t(5), profile: { ...base.profile, backstory: 'A story', goals: 'old goals' }, profile_times: { backstory: t(5), goals: t(1) } };
  const b = { ...base, updated_at: t(4), profile: { ...base.profile, backstory: 'old story', goals: 'B goals' }, profile_times: { backstory: t(1), goals: t(4) } };
  for (const [x, y] of [[a, b], [b, a]]) {
    const pc = mergeBundles(bundle({ entities: [x] }), bundle({ entities: [y] })).bundle.entities[0];
    assert.equal(pc.profile.backstory, 'A story');
    assert.equal(pc.profile.goals, 'B goals');
    assert.deepEqual(pc.profile_times, { backstory: t(5), goals: t(4) });
  }
});

test('types merge like records', () => {
  const ty = (label, d) => makeRecord('types', { label, plural: `${label}s`, fields: [] }, { id: 'type-x', now: t(d) });
  const m = mergeBundles(bundle({ types: [ty('Deity', 2)] }), bundle({ types: [ty('God', 3)] })).bundle;
  assert.equal(m.types[0].label, 'God');
});

test('duplicate stubs fold into the single real entity with that name, and references follow', () => {
  const real = e('real', 'Grimbold', 2);
  const s1 = e('s1', 'grimbold', 3, { stub: true, type_id: null });
  const s2 = e('s2', 'Grimbold', 4, { stub: true, type_id: null });
  const A = bundle({ entities: [real, s1], notes: [note('n1', 'met @[grimbold](s1)', 3, { mentions: ['s1'] })] });
  const B = bundle({
    entities: [s2],
    notes: [note('n2', 'paid @[Grimbold](s2)', 4, { mentions: ['s2'], promoted_to: ['s2'] })],
    relationships: [makeRecord('relationships', { from_id: 's2', to_id: 'real', type: 'ally' }, { id: 'r1', now: t(4) })],
    files: [makeRecord('files', { entity_id: 's2', mime: 'image/webp' }, { id: 'f1', now: t(4) })],
  });
  for (const [x, y] of [[A, B], [B, A]]) {
    const { bundle: m, report } = mergeBundles(x, y);
    const by = (k, id) => m[k].find((r) => r.id === id);
    assert.equal(report.stubsCombined, 2);
    for (const id of ['s1', 's2']) {
      assert.equal(by('entities', id).deleted, true);
      assert.equal(by('entities', id).merged_into, 'real');
      assert.equal(by('entities', id).updated_at, t(4), 'stamped with the group\'s newest time, not now');
    }
    assert.equal(by('notes', 'n1').text, 'met @[grimbold](real)');
    assert.deepEqual(by('notes', 'n2').mentions, ['real']);
    assert.deepEqual(by('notes', 'n2').promoted_to, ['real']);
    assert.equal(by('relationships', 'r1').from_id, 'real');
    assert.equal(by('files', 'f1').entity_id, 'real');
  }
  assert.equal(snap(mergeBundles(A, B).bundle), snap(mergeBundles(B, A).bundle));
});

test('without exactly one real entity, stubs fold into the oldest stub (then lowest id)', () => {
  const s1 = e('zz', 'Guard', 1, { stub: true, type_id: null });
  const s2 = e('aa', 'guard', 1, { stub: true, type_id: null });
  const s3 = e('mm', 'Guard', 3, { stub: true, type_id: null });
  const r1 = e('r1', 'Guard', 1); const r2 = e('r2', 'Guard', 1);
  const m = mergeBundles(bundle({ entities: [s1, s3, r1, r2] }), bundle({ entities: [s2] })).bundle;
  const live = m.entities.filter((x) => !x.deleted && x.stub).map((x) => x.id);
  assert.deepEqual(live, ['aa']);
});

test('merged_into chains are followed, link fields and the PC redirected', () => {
  const b = bundle({
    pc_entity_id: 'old-pc',
    entities: [
      { ...e('old-pc', 'Wren', 1), deleted: true, merged_into: 'mid' },
      { ...e('mid', 'Wren', 1), deleted: true, merged_into: 'pc' },
      e('pc', 'Wren', 1),
      e('ship', 'Gull', 1, { fields: { 'f-captain': 'old-pc', 'f-note': 'text' } }),
    ],
  });
  redirectMerged(b);
  assert.equal(b.pc_entity_id, 'pc');
  assert.deepEqual(b.entities.find((x) => x.id === 'ship').fields, { 'f-captain': 'pc', 'f-note': 'text' });
});

test('refuses different characters', () => {
  assert.throws(() => mergeBundles(bundle({}), bundle({ bundle_id: 'other' })));
});

test('blobsNeeded lists live files that came from the incoming side', () => {
  const f = (id, d, extra = {}) => makeRecord('files', { mime: 'image/webp', ...extra }, { id, now: t(d) });
  const { blobsNeeded } = mergeBundles(bundle({ files: [f('mine', 1), { ...f('back', 1), deleted: true }] }), bundle({ files: [f('new', 2), f('mine', 1), { ...f('dead', 2), deleted: true }, f('back', 3)] }));
  assert.deepEqual(blobsNeeded.sort(), ['back', 'new']);
});
