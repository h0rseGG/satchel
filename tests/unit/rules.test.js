import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badge, recordChanges, recordBackup, emptyBackupMeta, shouldNudge } from '../../js/core/backup.js';
import { shouldAutoEnd, startSession, endSession, noteMode } from '../../js/core/session.js';
import { classifyUpload, isValidUtf8, fitWithin, MAX_BYTES, extFor } from '../../js/core/files-rules.js';
import { builtinTypes, makeType, addField, renameField, removeField, canDeleteType, fieldValueError, isPerson } from '../../js/core/types.js';
import { makeRecord, normalise, isDndBeyondUrl, newerOf, resolveMerged } from '../../js/core/model.js';

const H = 3600 * 1000;
const at = (ms) => new Date(Date.parse('2026-10-01T00:00:00.000Z') + ms).toISOString();

// --- backup badge (7.3) ---
test('badge: never backed up is red', () => {
  assert.equal(badge(emptyBackupMeta(), at(0)).level, 'err');
  assert.equal(badge(recordChanges(emptyBackupMeta(), 1, at(0)), at(1)).level, 'err');
});

test('badge: green, grey < 24 h, yellow > 24 h, red > 7 days', () => {
  let m = recordBackup(emptyBackupMeta(), at(0));
  assert.deepEqual(badge(m, at(H)), { level: 'ok', changes: 0, never: false });
  m = recordChanges(m, 2, at(H));
  m = recordChanges(m, 1, at(5 * H));
  assert.equal(m.changes_since_backup, 3);
  assert.equal(m.first_change_at, at(H), 'ages from the first change');
  assert.equal(badge(m, at(24 * H)).level, 'grey');
  assert.equal(badge(m, at(25 * H)).level, 'warn');
  assert.equal(badge(m, at(7 * 24 * H + H)).level, 'err');
  assert.equal(shouldNudge(m), true);
  m = recordBackup(m, at(200 * H));
  assert.deepEqual([m.changes_since_backup, m.first_change_at, badge(m, at(201 * H)).level], [0, null, 'ok']);
  assert.equal(shouldNudge(m), false);
  assert.equal(recordChanges(m, 0, at(0)), m, 'zero changes is a no-op');
});

// --- session (6) ---
test('session: auto-end after 12 h with no in-session note or mode change', () => {
  const s = startSession(at(0));
  assert.equal(noteMode(s), 'in');
  assert.equal(noteMode(endSession(at(1))), 'out');
  assert.equal(shouldAutoEnd(s, null, at(12 * H - 1)), false);
  assert.equal(shouldAutoEnd(s, null, at(12 * H)), true);
  assert.equal(shouldAutoEnd(s, at(10 * H), at(21 * H)), false, 'a recent note keeps it going');
  assert.equal(shouldAutoEnd(s, at(10 * H), at(22 * H)), true);
  assert.equal(shouldAutoEnd(endSession(at(0)), null, at(99 * H)), false);
});

// --- files (3.6) ---
test('uploads: images and .txt/.md up to 10 MB; svg and others refused', () => {
  assert.deepEqual(classifyUpload({ name: 'map.png', type: 'image/png', size: 100 }), { ok: true, kind: 'image' });
  assert.deepEqual(classifyUpload({ name: 'notes.MD', type: '', size: 5 }), { ok: true, kind: 'text', mime: 'text/markdown' });
  assert.equal(classifyUpload({ name: 'a.txt', type: 'text/plain', size: MAX_BYTES + 1 }).reason, 'too-big');
  assert.equal(classifyUpload({ name: 'x.svg', type: 'image/svg+xml', size: 5 }).reason, 'unsupported');
  assert.equal(classifyUpload({ name: 'x.pdf', type: 'application/pdf', size: 5 }).reason, 'unsupported');
  assert.equal(classifyUpload({ name: 'x.txt', type: 'text/plain', size: 0 }).reason, 'empty');
  assert.equal(extFor('image/jpeg'), 'jpg');
});

test('UTF-8 check and resize', () => {
  assert.equal(isValidUtf8(new TextEncoder().encode('Zoë ’s')), true);
  assert.equal(isValidUtf8(new Uint8Array([0xff, 0xfe, 0x00])), false);
  assert.deepEqual(fitWithin(5120, 2560), { width: 2560, height: 1280 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 }, 'never upscales');
});

// --- types (3.2) ---
test('built-ins have fixed ids and timestamps; npc and character are people', () => {
  const a = builtinTypes();
  assert.deepEqual(a.map((t) => t.id), ['type-npc', 'type-location', 'type-faction', 'type-item', 'type-character', 'type-other']);
  assert.deepEqual(a, builtinTypes(), 'identical on every device');
  assert.deepEqual(a.filter((t) => t.person).map((t) => t.id), ['type-npc', 'type-character']);
});

test('custom types and fields: add, rename, remove keeps values', () => {
  let deity = makeType({ label: 'Deity', plural: 'Deities' }, { id: 'type-deity', now: at(0) });
  deity = addField(deity, { label: 'Domain', kind: 'text' }, { id: 'f-domain', now: at(1) });
  deity = renameField(deity, 'f-domain', 'Domains', { now: at(2) });
  assert.deepEqual(deity.fields, [{ id: 'f-domain', label: 'Domains', kind: 'text' }]);
  assert.equal(deity.updated_at, at(2));
  const god = makeRecord('entities', { name: 'Auril', type_id: 'type-deity', fields: { 'f-domain': 'winter' } });
  deity = removeField(deity, 'f-domain');
  assert.equal(deity.fields.length, 0);
  assert.equal(god.fields['f-domain'], 'winter', 'value stays on the entity');
  assert.throws(() => addField(deity, { label: 'x', kind: 'colour' }));
  const ship = addField(makeType({ label: 'Ship' }), { label: 'Captain', kind: 'link', link_type: 'type-npc' });
  assert.equal(ship.fields[0].link_type, 'type-npc');
  assert.equal(ship.plural, 'Ships');
});

test('deleting a type: never built-ins; custom only when unused', () => {
  const deity = makeType({ label: 'Deity' }, { id: 'type-deity' });
  const god = makeRecord('entities', { name: 'Auril', type_id: 'type-deity' });
  assert.deepEqual(canDeleteType(builtinTypes()[0], []), { ok: false, reason: 'builtin' });
  assert.deepEqual(canDeleteType(deity, [god]), { ok: false, reason: 'in-use', count: 1 });
  assert.deepEqual(canDeleteType(deity, [{ ...god, deleted: true }]), { ok: true });
});

test('field values', () => {
  assert.equal(fieldValueError('number', '12.5'), null);
  assert.equal(fieldValueError('number', 'twelve'), 'not-a-number');
  assert.equal(fieldValueError('date', '2026-10-01'), null);
  assert.equal(fieldValueError('date', '1/10/2026'), 'not-a-date');
  assert.equal(fieldValueError('url', 'https://x.com'), null);
  assert.equal(fieldValueError('url', 'javascript:alert(1)'), 'not-a-url');
  assert.equal(fieldValueError('text', ''), null);
});

test('stubs count as people', () => {
  const byId = new Map(builtinTypes().map((t) => [t.id, t]));
  assert.equal(isPerson({ type_id: null, stub: true }, byId), true);
  assert.equal(isPerson({ type_id: 'type-location' }, byId), false);
});

// --- model (3) ---
test('records: uuid, timestamps, defaults; unknown fields survive', () => {
  const n = makeRecord('notes', { text: 'x' }, { now: at(0) });
  assert.match(n.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual([n.created_at, n.updated_at, n.deleted, n.mode], [at(0), at(0), false, 'out']);
  const r = normalise('entities', { id: 'x', name: 'A', aliases: 'oops', future_field: 1 });
  assert.deepEqual([r.aliases, r.future_field, r.fields], [[], 1, {}]);
});

test('D&D Beyond links: www.dndbeyond.com and ddb.ac over https only', () => {
  assert.equal(isDndBeyondUrl('https://www.dndbeyond.com/characters/12345678'), true);
  assert.equal(isDndBeyondUrl('https://ddb.ac/characters/6648868/5liMnV'), true);
  assert.equal(isDndBeyondUrl('http://www.dndbeyond.com/characters/1'), false);
  assert.equal(isDndBeyondUrl('https://dndbeyond.com.evil.com/x'), false);
  assert.equal(isDndBeyondUrl('not a url'), false);
});

test('newerOf and resolveMerged', () => {
  const a = { id: 'x', updated_at: at(1), v: 1 };
  const b = { id: 'x', updated_at: at(2), v: 2 };
  assert.equal(newerOf(a, b), b);
  assert.equal(newerOf(b, a), b);
  const byId = new Map([['a', { id: 'a', merged_into: 'b' }], ['b', { id: 'b', merged_into: 'a' }]]);
  assert.ok(resolveMerged('a', byId), 'cycles stop');
});
