// The demo is real-sounding data run through the real parser (v1 lesson 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDemo, EXPORTED_AT } from '../../tools/demo-data.mjs';
import { packKit, unpackKit } from '../../js/core/kit.js';
import { mergeBundles } from '../../js/core/merge.js';
import { shortNames } from '../../js/core/shortnames.js';

const { bundle, blobs } = buildDemo();
const byId = new Map(bundle.entities.map((e) => [e.id, e]));
const byName = (n) => bundle.entities.find((e) => e.name === n);
const mentionedIn = (fragment) => bundle.notes.find((n) => n.text.includes(fragment)).mentions.map((id) => byId.get(id).name);

test('committed demo/wren.kit is up to date (run node tools/make-demo-kit.mjs)', () => {
  const fresh = packKit(bundle, blobs, { now: new Date(EXPORTED_AT) }).bytes;
  const committed = new Uint8Array(readFileSync(new URL('../../demo/wren.kit', import.meta.url)));
  assert.deepEqual(committed, fresh);
});

test('demo kit unpacks with the expected counts', () => {
  const r = unpackKit(readFileSync(new URL('../../demo/wren.kit', import.meta.url)));
  assert.equal(r.ok, true);
  const live = (t) => r.bundle[t].filter((x) => !x.deleted).length;
  assert.deepEqual([live('notes'), live('entities'), live('types'), live('relationships'), live('files'), r.blobs.size], [47, 23, 8, 9, 1, 1]);
  assert.equal(r.bundle.notes.filter((n) => !n.triaged_at).length, 12, 'inbox');
  assert.equal(byId.get(r.bundle.pc_entity_id).name, 'Wren Ashdown');
});

test('the resolver handled the messy notes', () => {
  assert.deepEqual(mentionedIn('lends at 10%'), ['Grimbold Ironhand'], 'short name');
  assert.deepEqual(mentionedIn('HOW???'), ['Lyra Ashdown'], 'possessive');
  assert.deepEqual(mentionedIn('street name'), ['Mira Vane'], 'alias');
  assert.deepEqual(mentionedIn('is lovely'), ['Sister Caldra', 'Sister Morwen'], 'lower-case short name; shared title is not one');
  assert.deepEqual(mentionedIn('boat at the jetty'), ['The Gull’s Wake', 'Captain Rook Harlow'], 'apostrophe inside a name');
  assert.deepEqual(bundle.entities.filter((e) => e.stub).map((e) => e.name).sort(), ['Grimbol', 'Hollow King', 'Pip', 'Vex']);
  const hk = byName('Hollow King');
  assert.equal(bundle.notes.filter((n) => n.mentions.includes(hk.id)).length, 2, 'second @Hollow_King matched the stub, no duplicate');
});

test('short names in the demo', () => {
  const typesById = new Map(bundle.types.map((t) => [t.id, t]));
  const sn = shortNames(bundle.entities, typesById);
  for (const w of ['grimbold', 'aldric', 'caldra', 'lyra', 'mira', 'rook', 'kael', 'oswin']) assert.ok(sn.has(w), w);
  for (const w of ['ashdown', 'sister']) assert.ok(!sn.has(w), w);
});

test('edited note keeps its first version and still points at the same entity', () => {
  const n = bundle.notes.find((x) => x.original_text);
  assert.match(n.original_text, /^@\[Aldric\]/);
  assert.deepEqual(n.mentions.map((id) => byId.get(id).name), ['Lord Aldric Thorne', 'Lyra Ashdown']);
});

test('custom types: Deity with Domain, Ship with a Captain link', () => {
  const ship = bundle.types.find((t) => t.label === 'Ship');
  assert.deepEqual(ship.fields, [{ id: 'f-captain', label: 'Captain', kind: 'link', link_type: 'type-npc' }]);
  assert.equal(byId.get(byName('The Gull’s Wake').fields['f-captain']).name, 'Captain Rook Harlow');
  assert.equal(byName('Auril').fields['f-domain'], 'Winter');
});

test('rebuilding merges cleanly: nothing added or changed', () => {
  const again = buildDemo().bundle;
  const { report } = mergeBundles(bundle, again);
  assert.deepEqual(report, { added: 0, updated: 0, stubsCombined: 0 });
});
