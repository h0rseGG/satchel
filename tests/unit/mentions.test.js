import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findTyped, tokenise, storedIds, parts, plain, activeQuery, typedForm, matchByName, suggest, token,
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

test('suggest: prefix matches before substring matches, limited', () => {
  const ents = ['Grimbold', 'Agrim', 'Mira', 'Grista'].map((n) => makeEntity({ name: n }));
  const got = suggest(ents, 'gri').map((e) => e.name);
  assert.deepEqual(got.slice(0, 2).sort(), ['Grimbold', 'Grista']);
  assert.equal(got[2], 'Agrim');
  assert.ok(!got.includes('Mira'));
  assert.equal(suggest(ents, '', 2).length, 2);
});
