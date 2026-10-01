import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findTyped, tokenise, storedIds, parts, plain, activeQuery, typedForm, matchByName, suggest, token,
  resolveMentions, linkPlainName, toTypedForEdit, shortNames,
} from '../../js/mentions.js';
import { makeEntity, touch } from '../../js/model.js';

const names = (text) => findTyped(text).map((m) => m.name);

test('findTyped: basic, start of text, after punctuation', () => {
  assert.deepEqual(names('@Grimbold said hi'), ['Grimbold']);
  assert.deepEqual(names('met (@Grimbold) and @Mira.'), ['Grimbold', 'Mira']);
});

test('findTyped: underscores become spaces', () => {
  assert.deepEqual(names('bowed to @Lord_Aldric today'), ['Lord Aldric']);
});

test('findTyped: possessive and trailing joiners are dropped', () => {
  const [m] = findTyped("took @Grimbold's hammer");
  assert.equal(m.name, 'Grimbold');
  assert.equal("took @Grimbold's hammer".slice(m.start, m.end), '@Grimbold');
  assert.deepEqual(names('@Lord_Aldric_ left'), ['Lord Aldric']);
});

test('findTyped: emails and a bare @ are ignored', () => {
  assert.deepEqual(names('mail kael@example.com or @ nobody'), []);
});

test('findTyped: unicode and hyphenated names', () => {
  assert.deepEqual(names('@Zoë and @Jean-Luc and @D’Arcy'), ['Zoë', 'Jean-Luc', 'D’Arcy']);
});

test('tokenise replaces resolved mentions and keeps the rest', () => {
  const g = { id: '11111111-1111-4111-8111-111111111111', name: 'Grimbold' };
  const a = { id: '22222222-2222-4222-8222-222222222222', name: 'Lord Aldric' };
  const resolved = new Map([['grimbold', g], ['lord aldric', a]]);
  const out = tokenise("@grimbold's hammer, owed to @Lord_Aldric.", resolved);
  assert.equal(out, `${token(g)}'s hammer, owed to ${token(a)}.`);
  assert.deepEqual(storedIds(out), [g.id, a.id]);
});

test('tokenise leaves unresolved mentions as typed', () => {
  assert.equal(tokenise('hi @Nobody', new Map()), 'hi @Nobody');
});

test('token strips brackets from labels so the token stays parseable', () => {
  const t = token({ id: '33333333-3333-4333-8333-333333333333', name: 'The [Masked] One' });
  assert.equal(parts(t)[0].label, 'The Masked One');
});

test('parts and plain round-trip stored text', () => {
  const id = '44444444-4444-4444-8444-444444444444';
  const text = `met @[Grim](${id}) at noon`;
  assert.deepEqual(parts(text), [
    { type: 'text', value: 'met ' },
    { type: 'mention', id, label: 'Grim' },
    { type: 'text', value: ' at noon' },
  ]);
  assert.equal(plain(text), 'met Grim at noon');
  assert.equal(plain(text, () => 'Grimbold'), 'met Grimbold at noon', 'current name wins over label');
});

test('storedIds dedupes repeated mentions', () => {
  const id = '55555555-5555-4555-8555-555555555555';
  assert.deepEqual(storedIds(`@[A](${id}) and @[A](${id})`), [id]);
});

test('activeQuery finds the @token at the caret', () => {
  assert.deepEqual(activeQuery('talked to @Gri', 14), { start: 10, query: 'Gri' });
  assert.deepEqual(activeQuery('@Lord_Al', 8), { start: 0, query: 'Lord Al' });
  assert.deepEqual(activeQuery('hi @', 4), { start: 3, query: '' });
  assert.equal(activeQuery('talked to @Gri then', 19), null);
  assert.equal(activeQuery('kael@exa', 8), null);
});

test('typedForm uses underscores', () => {
  assert.equal(typedForm('Lord  Aldric'), '@Lord_Aldric');
});

test('matchByName: case-insensitive, aliases, prefers non-stub then newest', () => {
  const stub = makeEntity({ name: 'Grimbold' });
  const real = makeEntity({ name: 'grimbold', type: 'npc' });
  const alias = makeEntity({ name: 'Mira Vane', type: 'npc', aliases: ['The Fox'] });
  assert.equal(matchByName([stub, real, alias], 'GRIMBOLD'), real);
  assert.equal(matchByName([stub, real, alias], 'the fox'), alias);
  assert.equal(matchByName([stub, real, alias], 'nobody'), null);

  const older = touch(makeEntity({ name: 'Twin', type: 'npc' }), {}, '2020-01-01T00:00:00.000Z');
  const newer = touch(makeEntity({ name: 'Twin', type: 'npc' }), {}, '2030-01-01T00:00:00.000Z');
  assert.equal(matchByName([older, newer], 'twin'), newer);
});

test('resolveMentions: links existing, creates one stub per new name, honours picks', () => {
  const grim = makeEntity({ name: 'Grimbold', type: 'npc' });
  const twinA = makeEntity({ name: 'Twin', type: 'npc' });
  const twinB = makeEntity({ name: 'Twin', type: 'npc' });
  const r = resolveMentions('@grimbold met @Zed and @zed and @Twin', [grim, twinA, twinB], { twin: twinA.id });
  assert.equal(r.created.length, 1);
  assert.equal(r.created[0].name, 'Zed');
  assert.equal(r.created[0].stub, true);
  assert.deepEqual(r.mentions, [grim.id, r.created[0].id, twinA.id]);
  assert.equal(findTyped(r.text).length, 0, 'nothing left unlinked');
});

test('resolveMentions is idempotent on already-linked text', () => {
  const grim = makeEntity({ name: 'Grimbold' });
  const once = resolveMentions('saw @Grimbold', [grim]);
  const twice = resolveMentions(once.text, [grim]);
  assert.equal(twice.text, once.text);
  assert.deepEqual(twice.created, []);
});

test('linkPlainName: links the last plain occurrence, any case', () => {
  const blade = makeEntity({ name: 'Sunblade', type: 'item' });
  const r = linkPlainName('sunblade? yes, the SUNBLADE glows', blade);
  assert.equal(r.text, 'sunblade? yes, the @Sunblade glows');
  assert.equal(r.start, 19);
  assert.equal(r.removed, 8);
  assert.equal(r.inserted, 9);
});

test('linkPlainName: multi-word names and aliases become typed form', () => {
  const lord = makeEntity({ name: 'Lord Aldric', type: 'npc', aliases: ['The Miller'] });
  assert.equal(linkPlainName('bowed to lord  aldric', lord).text, 'bowed to @Lord_Aldric');
  assert.equal(linkPlainName('paid the miller', lord).text, 'paid @Lord_Aldric');
});

test('linkPlainName: ignores names already mentioned or inside other words', () => {
  const lord = makeEntity({ name: 'Lord Aldric', type: 'npc' });
  const al = makeEntity({ name: 'Al', type: 'npc' });
  assert.equal(linkPlainName('met @Lord_Aldric', lord), null);
  assert.equal(linkPlainName('met @Al and Alder', al), null);
  assert.equal(linkPlainName('nobody here', al), null);
});

test('toTypedForEdit round-trips through resolveMentions to the same links', () => {
  const lord = makeEntity({ name: 'Lord Aldric', type: 'npc' });
  const twinA = makeEntity({ name: 'Twin', type: 'npc' });
  const twinB = makeEntity({ name: 'Twin', type: 'npc' });
  const stored = `bowed to ${token(lord)} and met ${token(twinB)}.`;
  const names = new Map([lord, twinA, twinB].map((e) => [e.id, e.name]));
  const { text, picked } = toTypedForEdit(stored, names);
  assert.equal(text, 'bowed to @Lord_Aldric and met @Twin.');
  const back = resolveMentions(text, [lord, twinA, twinB], picked);
  assert.equal(back.text, stored, 'same entity, even with a duplicate name');
  assert.deepEqual(back.created, []);
});

test('toTypedForEdit leaves tokens of deleted entities untouched', () => {
  const gone = makeEntity({ name: 'Zoltan' });
  const stored = `met ${token(gone)}`;
  const { text } = toTypedForEdit(stored, new Map());
  assert.equal(text, stored);
  assert.deepEqual(resolveMentions(text, []).created, [], 'no stub recreated');
});

test('shortNames: unique 4+ letter words of people’s names', () => {
  const grim = makeEntity({ name: 'Grimbold Ironhand', type: 'npc' });
  const tam = makeEntity({ name: 'Old Tam', type: 'npc' });
  const mill = makeEntity({ name: 'Old Mill', type: 'location' });
  const sis1 = makeEntity({ name: 'Sister Caldra', type: 'npc' });
  const sis2 = makeEntity({ name: 'Sister Moira', type: 'npc' });
  const mira = makeEntity({ name: 'Mira Vane', type: 'npc' });
  const miraTown = makeEntity({ name: 'Mira', type: 'location' });   // a real "Mira" exists
  const wren = makeEntity({ name: 'Wren Ashdown', type: 'character' });
  const lyra = makeEntity({ name: 'Lyra Ashdown', type: 'npc' });
  const order = makeEntity({ name: 'Order of the Pale Lantern', type: 'faction' });
  const map = shortNames([grim, tam, mill, sis1, sis2, mira, miraTown, wren, lyra, order]);
  assert.deepEqual(map.get(grim.id), ['Grimbold', 'Ironhand']);
  assert.deepEqual(map.get(sis1.id), ['Caldra'], 'title shared by two sisters is not used');
  assert.deepEqual(map.get(sis2.id), ['Moira']);
  assert.deepEqual(map.get(mira.id), ['Vane'], '"Mira" is another entity’s name');
  assert.deepEqual(map.get(wren.id), ['Wren'], 'shared surname not used');
  assert.deepEqual(map.get(lyra.id), ['Lyra']);
  assert.equal(map.has(tam.id), false, 'Tam is too short, Old is shared');
  assert.equal(map.has(order.id), false, 'not a person');
});

test('@FirstName links to the one entity it can mean instead of making a stub', () => {
  const grim = makeEntity({ name: 'Grimbold Ironhand', type: 'npc' });
  const r = resolveMentions('paid @grimbold today', [grim]);
  assert.deepEqual(r.created, []);
  assert.deepEqual(r.mentions, [grim.id]);
  assert.equal(r.text, `paid ${token(grim)} today`);
});

test('linkPlainName: the full name wins over a short name inside it', () => {
  const lord = makeEntity({ name: 'Lord Aldric', type: 'npc' });
  assert.equal(linkPlainName('bowed to lord aldric', lord, ['Lord', 'Aldric']).text, 'bowed to @Lord_Aldric');
  assert.equal(linkPlainName('lord aldric? aldric!', lord, ['Aldric']).text, 'lord aldric? @Lord_Aldric!');
});

test('linkPlainName with a short name links the full entity', () => {
  const grim = makeEntity({ name: 'Grimbold Ironhand', type: 'npc' });
  assert.equal(linkPlainName('ask grimbold', grim, ['Grimbold']).text, 'ask @Grimbold_Ironhand');
  assert.equal(linkPlainName('ask grimbold', grim), null);
});

test('suggest: prefix matches before substring matches, limited', () => {
  const ents = ['Grimbold', 'Agrim', 'Mira', 'Grista'].map((n) => makeEntity({ name: n }));
  const got = suggest(ents, 'gri').map((e) => e.name);
  assert.deepEqual(got.slice(0, 2).sort(), ['Grimbold', 'Grista']);
  assert.equal(got[2], 'Agrim');
  assert.ok(!got.includes('Mira'));
  assert.equal(suggest(ents, '', 2).length, 2);
});
