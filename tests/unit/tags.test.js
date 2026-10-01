import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTags, tagKeys, suggestTags, tagCounts, typedTag } from '../../js/core/tags.js';

const keys = (t) => tagKeys(t);

test('#tag and #two_words', () => {
  assert.deepEqual(keys('met him #debts and #do_NOT_trust'), ['debts', 'do not trust']);
});

test('only at the start or after a non-word character', () => {
  assert.deepEqual(keys('#start mid#dle (#paren)'), ['start', 'paren']);
});

test('URLs with # are not tags', () => {
  assert.deepEqual(keys('see https://example.com/page#section and www.x.com/#a #real'), ['real']);
});

test('must start with a letter: #1 and #3pm stay text', () => {
  assert.deepEqual(keys('#1 priority at #3pm, # heading'), []);
});

test('trailing _ - ’ dropped; possessive dropped', () => {
  const t = findTags('#lyra’s #debts_ #rivals-');
  assert.deepEqual(t.map((x) => x.key), ['lyra', 'debts', 'rivals']);
  assert.equal('#lyra’s'.slice(t[0].start, t[0].end), '#lyra');
});

test('unicode letters', () => {
  assert.deepEqual(keys('#öl #日本'), ['öl', '日本']);
});

test('tags inside stored mention labels are ignored', () => {
  assert.deepEqual(keys('@[Room #4](abc) #real'), ['real']);
});

test('keys are unique, lower case, first-seen order', () => {
  assert.deepEqual(keys('#B #a #b'), ['b', 'a']);
});

test('suggestions: prefix then substring, most used first', () => {
  const counts = tagCounts([
    { tags: ['debts'] }, { tags: ['debts', 'do not trust'] }, { tags: ['old debts'] }, { tags: ['dragons'], deleted: true },
  ]);
  assert.deepEqual(suggestTags('d', counts).map((s) => s.key), ['debts', 'do not trust', 'old debts']);
  assert.deepEqual(suggestTags('debt', counts).map((s) => s.key), ['debts', 'old debts']);
  assert.equal(typedTag('do not trust'), '#do_not_trust');
});
