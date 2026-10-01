import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoEnd } from '../../js/session.js';

const NOW = Date.parse('2026-10-10T12:00:00.000Z');
const ago = (h) => new Date(NOW - h * 3600 * 1000).toISOString();

test('only an In session can auto-end', () => {
  assert.equal(shouldAutoEnd({ mode: 'out', mode_since: ago(100) }, null, NOW), false);
  assert.equal(shouldAutoEnd({}, null, NOW), false);
});

test('ends after 12 h with no in-session note or mode change', () => {
  assert.equal(shouldAutoEnd({ mode: 'in', mode_since: ago(11.9) }, null, NOW), false);
  assert.equal(shouldAutoEnd({ mode: 'in', mode_since: ago(12.1) }, null, NOW), true);
});

test('a recent in-session note keeps the session going', () => {
  assert.equal(shouldAutoEnd({ mode: 'in', mode_since: ago(20) }, ago(2), NOW), false);
  assert.equal(shouldAutoEnd({ mode: 'in', mode_since: ago(20) }, ago(13), NOW), true);
});

test('a game that runs past midnight is not cut off', () => {
  // Started 19:00, last note 01:30, checked at 09:00: 7.5 h idle.
  const now = Date.parse('2026-10-11T09:00:00');
  assert.equal(shouldAutoEnd({ mode: 'in', mode_since: '2026-10-10T19:00:00' }, '2026-10-11T01:30:00', now), false);
});
