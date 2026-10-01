import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findTyped, buildNameIndex, resolveText, toTypedForm, segments, plainText,
  activeToken, suggestEntities, applyEntityPick, findNames, namedEntities, linkTarget, linkOccurrence, mentionIds,
} from '../../js/core/mentions.js';
import { shortNames } from '../../js/core/shortnames.js';
import { ent, stub, typesById, T0 } from './helpers.js';

const names = (t) => findTyped(t).map((x) => x.name);

// --- 4.1 typed form ---
test('@Name and @Multi_Word', () => {
  assert.deepEqual(names('saw @Grimbold and @Lord_Aldric'), ['Grimbold', 'Lord Aldric']);
});

test('possessive dropped and kept as text, straight and curly', () => {
  const t = 'met @Mira’s cat and @Mira\'s dog';
  const f = findTyped(t);
  assert.deepEqual(f.map((x) => x.name), ['Mira', 'Mira']);
  assert.equal(t.slice(f[0].end, f[0].end + 2), '’s');
});

test('trailing _ - ’ dropped', () => {
  assert.deepEqual(names('@Grim_ @Mira- @Lyra’ @Aldric_-'), ['Grim', 'Mira', 'Lyra', 'Aldric']);
});

test('emails do not trigger; start of text and after punctuation do', () => {
  assert.deepEqual(names('mail bob@inn.com @Start (@Paren) "@Quote"'), ['Start', 'Paren', 'Quote']);
});

test('unicode letters', () => {
  assert.deepEqual(names('@Zoë and @Ærin_Þór'), ['Zoë', 'Ærin Þór']);
});

test('@ followed by a digit or space stays text', () => {
  assert.deepEqual(names('meet @5pm @ the inn'), []);
});

test('@ inside URLs ignored', () => {
  assert.deepEqual(names('https://mastodon.social/@someone @Real'), ['Real']);
});

// --- 4.1 resolution ---
test('resolution order: pick, exact (case-insensitive), short name, stub', () => {
  const grim = ent('Grimbold Ironhand');
  const grim2 = ent('Grimbold', { type_id: 'type-other' });
  const mira = ent('Mira Vane', { aliases: ['The Fox'] });
  const idx = buildNameIndex([grim, grim2, mira], typesById);

  let r = resolveText('@grimbold', idx);
  assert.equal(r.mentions[0], grim2.id, 'exact name beats short name');

  r = resolveText('@grimbold', idx, { picks: [{ name: 'Grimbold', id: grim.id }] });
  assert.equal(r.mentions[0], grim.id, 'pick beats exact');

  r = resolveText('@the_fox and @vane', idx);
  assert.deepEqual(r.mentions, [mira.id], 'alias and short name both resolve to Mira');
  assert.equal(r.stubs.length, 0);

  r = resolveText('@Nobody and @nobody again', idx, { now: T0 });
  assert.equal(r.stubs.length, 1, 'one stub per name per save');
  assert.equal(r.stubs[0].name, 'Nobody');
  assert.equal(r.stubs[0].stub, true);
  assert.equal(r.stubs[0].type_id, null);
  assert.deepEqual(r.mentions, [r.stubs[0].id]);
});

test('several exact matches: non-stub, then most recently edited', () => {
  const s = stub('Bob', { updated_at: '2026-09-09T00:00:00.000Z' });
  const old = ent('Bob', { updated_at: '2026-09-01T00:00:00.000Z' });
  const recent = ent('Bob', { updated_at: '2026-09-05T00:00:00.000Z' });
  const r = resolveText('@Bob', buildNameIndex([s, old, recent], typesById));
  assert.deepEqual(r.mentions, [recent.id]);
});

test('stored form: labels as typed, [] stripped, possessive kept as text', () => {
  const mira = ent('Mira Vane');
  const r = resolveText('@Mira’s back', buildNameIndex([mira], typesById));
  assert.equal(r.text, `@[Mira](${mira.id})’s back`);
  const r2 = resolveText('@Bob', buildNameIndex([], typesById), { now: T0, stubId: () => 'sid' });
  assert.equal(r2.text, '@[Bob](sid)');
});

test('existing stored tokens pass through untouched', () => {
  const r = resolveText('@[Ghost](gone-id) met @Ghost', buildNameIndex([], typesById), { now: T0, stubId: () => 'new' });
  assert.equal(r.text, '@[Ghost](gone-id) met @[Ghost](new)');
  assert.deepEqual(mentionIds(r.text), ['gone-id', 'new']);
});

test('pick for a deleted entity falls back to normal resolution', () => {
  const dead = ent('Mira', { deleted: true });
  const live = ent('Mira');
  const r = resolveText('@Mira', buildNameIndex([dead, live], typesById), { picks: [{ name: 'Mira', id: dead.id }] });
  assert.deepEqual(r.mentions, [live.id]);
});

// --- 4.1 editing ---
test('edit: typed form with current names, re-resolves to the same entities', () => {
  const ald = ent('Lord Aldric Thorne');
  const other = ent('Aldric', { type_id: 'type-other' });
  const byId = new Map([[ald.id, ald], [other.id, other]]);
  const stored = `paid @[aldric](${ald.id}) back`;
  const { text, picks } = toTypedForm(stored, byId);
  assert.equal(text, 'paid @Lord_Aldric_Thorne back');
  const r = resolveText(text, buildNameIndex([ald, other], typesById), { picks });
  assert.deepEqual(r.mentions, [ald.id]);
});

test('edit: tokens of deleted or missing entities are left untouched and never make stubs', () => {
  const dead = ent('Old Tom', { deleted: true });
  const byId = new Map([[dead.id, dead]]);
  const stored = `@[Old Tom](${dead.id}) and @[X](missing)`;
  const { text } = toTypedForm(stored, byId);
  assert.equal(text, stored);
  const r = resolveText(text, buildNameIndex([dead], typesById));
  assert.equal(r.stubs.length, 0);
  assert.equal(r.text, stored);
});

test('edit: merged entities show the survivor', () => {
  const surv = ent('Grimbold Ironhand');
  const gone = stub('Grimbol', { deleted: true, merged_into: surv.id });
  const byId = new Map([[surv.id, surv], [gone.id, gone]]);
  assert.equal(toTypedForm(`hi @[Grimbol](${gone.id})`, byId).text, 'hi @Grimbold_Ironhand');
  assert.equal(plainText(`hi @[Grimbol](${gone.id})`, byId), 'hi Grimbold Ironhand', 'merged typo shows the survivor\'s name');
});

test('edit: names that cannot be typed back stay in stored form', () => {
  const st = ent('St. Cuthbert');
  const mira = ent('Mira');
  const byId = new Map([[st.id, st], [mira.id, mira]]);
  const { text, picks } = toTypedForm(`@[St. Cuthbert](${st.id}) @[Mira](${mira.id})-chan`, byId);
  assert.equal(text, `@[St. Cuthbert](${st.id}) @[Mira](${mira.id})-chan`, 'a following "-chan" would change the name');
  assert.equal(picks.length, 0);
});

// --- display ---
test('display label: typed form while it is still a name, else the current name', async () => {
  const { displayLabel } = await import('../../js/core/mentions.js');
  const e = ent('Captain Rook Harlow', { aliases: ['The Crow'] });
  assert.equal(displayLabel('rook', e), 'Rook', 'a word of the name, spelled the entity\'s way');
  assert.equal(displayLabel('captain rook', e), 'Captain Rook');
  assert.equal(displayLabel('the crow', e), 'The Crow', 'alias');
  assert.equal(displayLabel('Grimbol', e), 'Captain Rook Harlow', 'no longer a name: current name');
  assert.equal(displayLabel('rook harlow captain', e), 'Captain Rook Harlow');
});

test('segments: mentions show the typed name, tags marked', () => {
  const m = ent('Mira Vane');
  const s = segments(`@[mira](${m.id})’s back #lyra`, new Map([[m.id, m]]));
  assert.deepEqual(s, [
    { type: 'mention', id: m.id, label: 'Mira', missing: false },
    { type: 'text', text: '’s back ' },
    { type: 'tag', text: '#lyra', key: 'lyra' },
  ]);
});

// --- 4.2 autocomplete ---
test('active token for @ and #, with query', () => {
  assert.deepEqual(activeToken('hi @Lord_Al', 11), { kind: '@', start: 3, end: 11, query: 'Lord Al' });
  assert.deepEqual(activeToken('hi @', 4), { kind: '@', start: 3, end: 4, query: '' });
  assert.equal(activeToken('bob@inn', 7), null);
  assert.equal(activeToken('hi there', 8), null);
  assert.deepEqual(activeToken('x #deb more', 6), { kind: '#', start: 2, end: 6, query: 'deb' });
  assert.equal(activeToken('see https://a.com/#frag', 23), null);
});

test('suggestions: prefix first, then substring, newest first, max 5', () => {
  const a = ent('Aldric', { updated_at: '2026-09-01T00:00:00.000Z' });
  const b = ent('Alda', { updated_at: '2026-09-03T00:00:00.000Z' });
  const c = ent('Lord Aldric', { updated_at: '2026-09-05T00:00:00.000Z' });
  const d = ent('Hal', { aliases: ['Aldo'], updated_at: '2026-09-02T00:00:00.000Z' });
  const gone = ent('Alder', { deleted: true });
  assert.deepEqual(suggestEntities('ald', [a, b, c, d, gone]).map((e) => e.name), ['Alda', 'Hal', 'Aldric', 'Lord Aldric']);
  const many = Array.from({ length: 8 }, (_, i) => ent(`Al${i}`));
  assert.equal(suggestEntities('al', many).length, 5);
});

test('picking inserts the typed form and records the pick', () => {
  const ald = ent('Lord Aldric');
  const tok = activeToken('met @lo', 7);
  const r = applyEntityPick('met @lo', tok, ald);
  assert.equal(r.text, 'met @Lord_Aldric ');
  assert.equal(r.caret, r.text.length);
  assert.deepEqual(r.pick, { name: 'Lord Aldric', id: ald.id });
});

// --- 4.3 short names ---
test('short names: 4+ letters, unique words, people only', () => {
  const es = [
    ent('Grimbold Ironhand'),
    ent('Sister Caldra'),
    ent('Sister Morwen'),
    ent('Wren Ashdown', { type_id: 'type-character' }),
    ent('Lyra Ashdown'),
    ent('Lord Aldric Thorne'),
    ent('Thorne Keep', { type_id: 'type-location' }),
    stub('Old Bess'),
    ent('Iron Mill', { type_id: 'type-location' }),
  ];
  const sn = [...shortNames(es, typesById).keys()].sort();
  assert.deepEqual(sn, ['aldric', 'bess', 'caldra', 'grimbold', 'ironhand', 'lord', 'lyra', 'morwen', 'wren']);
  // no "sister" (shared title), "ashdown" (shared surname), "thorne" (part of Thorne Keep),
  // "old" (3 letters), "keep"/"mill"/"iron" (not people).
});

test('a word that is another entity\'s name or alias is not a short name', () => {
  const es = [ent('Grimbold Ironhand'), ent('Hammer', { type_id: 'type-item', aliases: ['Grimbold'] })];
  assert.equal(shortNames(es, typesById).has('grimbold'), false);
});

// --- 4.5 recall ---
test('names in plain text: exact, alias, short name; not inside @tokens, #tags or URLs', () => {
  const g = ent('Grimbold Ironhand');
  const m = ent('Mira Vane', { aliases: ['the fox'] });
  const idx = buildNameIndex([g, m], typesById);
  const text = 'grimbold said The Fox was here, not @Mira or #grimbold or https://x.com/vane';
  const found = findNames(text, idx).map((o) => o.text).sort();
  assert.deepEqual(found, ['The Fox', 'grimbold']);
});

test('recall: most recently typed first, max 3, never the player character', () => {
  const pc = ent('Wren Ashdown', { type_id: 'type-character' });
  const a = ent('Aldric'); const b = ent('Bess'); const c = ent('Caldra'); const d = ent('Dorn');
  const idx = buildNameIndex([pc, a, b, c, d], typesById);
  const got = namedEntities('aldric bess wren caldra dorn aldric', idx, { exclude: [pc.id] }).map((e) => e.name);
  assert.deepEqual(got, ['Aldric', 'Dorn', 'Caldra']);
});

test('tap-to-link: "lord aldric" beats the short name "aldric" inside it', () => {
  const ald = ent('Lord Aldric');
  const idx = buildNameIndex([ald, ent('Lord Byron')], typesById);
  const text = 'aldric lied, then lord aldric left';
  const occ = linkTarget(text, ald.id, idx);
  assert.equal(occ.text, 'lord aldric');
  const r = linkOccurrence(text, occ, ald);
  assert.equal(r.text, 'aldric lied, then @lord_aldric left');
  const res = resolveText(r.text, idx, { picks: [r.pick] });
  assert.deepEqual(res.mentions, [ald.id]);
});

test('a match inside a longer match is dropped', () => {
  const ald = ent('Aldric', { type_id: 'type-other' });
  const lord = ent('Lord Aldric');
  const idx = buildNameIndex([ald, lord], typesById);
  assert.deepEqual(namedEntities('then lord aldric left', idx).map((e) => e.name), ['Lord Aldric']);
});

test('apostrophes match either way in plain text', () => {
  const o = ent("O'Brien Tull");
  const idx = buildNameIndex([o], typesById);
  assert.equal(findNames('saw O’Brien Tull', idx).length, 1);
});
