import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupStatus } from '../../js/backup.js';

const NOW = Date.parse('2026-10-10T12:00:00.000Z');
const ago = (hours) => new Date(NOW - hours * 3600 * 1000).toISOString();

test('never backed up is an error, with or without changes', () => {
  assert.deepEqual(backupStatus({}, NOW), { kind: 'err', text: 'Not backed up' });
  assert.equal(backupStatus({ changes_since_backup: 5 }, NOW).kind, 'err');
});

test('backed up with no changes is ok', () => {
  assert.deepEqual(backupStatus({ last_backup_at: ago(500), changes_since_backup: 0 }, NOW), { kind: 'ok', text: 'Backed up' });
});

test('fresh changes are neutral, with singular/plural text', () => {
  const s = backupStatus({ last_backup_at: ago(48), changes_since_backup: 1, first_change_at: ago(2) }, NOW);
  assert.deepEqual(s, { kind: 'neutral', text: '1 change since backup' });
  assert.equal(backupStatus({ last_backup_at: ago(48), changes_since_backup: 3, first_change_at: ago(2) }, NOW).text, '3 changes since backup');
});

test('the age of the oldest change sets the colour: 24 h warn, 7 days error', () => {
  const at = (h) => backupStatus({ last_backup_at: ago(1000), changes_since_backup: 2, first_change_at: ago(h) }, NOW).kind;
  assert.equal(at(23.9), 'neutral');
  assert.equal(at(24.1), 'warn');
  assert.equal(at(24 * 7 - 0.1), 'warn');
  assert.equal(at(24 * 7 + 0.1), 'err');
});

test('missing first_change_at falls back to the last backup time', () => {
  assert.equal(backupStatus({ last_backup_at: ago(30), changes_since_backup: 1 }, NOW).kind, 'warn');
});
