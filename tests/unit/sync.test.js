import { test } from 'node:test';
import assert from 'node:assert/strict';
import { github, gitBlobSha, toBase64, fromBase64, GitHubError, ConflictError } from '../../js/github.js';
import { pull, push, folderFor, folderShasAfterPush, remoteChanged, SYNC_INFO } from '../../js/syncCore.js';
import { fakeGitHub } from '../fake-github.js';

const enc = (s) => new TextEncoder().encode(s);
const BUNDLE = '11111111-1111-4111-8111-111111111111';
const FOLDER = folderFor(BUNDLE);
const info = { device: 'PC', synced_at: '2026-10-01T10:00:00.000Z' };

function setup(opts) {
  const fake = fakeGitHub(opts);
  const gh = github({ token: 'good-token', repo: 'h0rseGG/satchel-data', fetchFn: fake.fetchFn });
  return { fake, gh };
}

test('gitBlobSha matches git (hello\\n)', async () => {
  // `printf 'hello\n' | git hash-object --stdin`
  assert.equal(await gitBlobSha(enc('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
});

test('base64 round trip, including large and wrapped input', () => {
  const big = new Uint8Array(200000).map((_, i) => i % 256);
  assert.deepEqual(fromBase64(toBase64(big)), big);
  assert.deepEqual(fromBase64('aGVs\nbG8='), enc('hello'));
});

test('first push into an empty folder writes the files and sync.json', async () => {
  const { fake, gh } = setup();
  const pulled = await pull(gh, 'main', FOLDER);
  assert.equal(pulled.shas.size, 0);
  const r = await push(gh, 'main', FOLDER, pulled, { 'character.json': enc('{"a":1}'), 'notes.jsonl': enc('') }, { message: 'Sync from PC', info });
  assert.deepEqual(r.changed.sort(), ['character.json', 'notes.jsonl']);
  const files = await fake.snapshot();
  assert.equal(files[`${FOLDER}character.json`], '{"a":1}');
  assert.equal(JSON.parse(files[`${FOLDER}${SYNC_INFO}`]).device, 'PC');
  assert.equal(files['README.md'], '# satchel-data\n', 'other files untouched');
});

test('pull reads the folder back byte-for-byte', async () => {
  const { gh } = setup();
  await push(gh, 'main', FOLDER, await pull(gh, 'main', FOLDER), { 'character.json': enc('x'), 'images/a.webp': new Uint8Array([1, 2, 255]) }, { message: 'm', info });
  const pulled = await pull(gh, 'main', FOLDER);
  assert.deepEqual(pulled.files['images/a.webp'], new Uint8Array([1, 2, 255]));
  assert.deepEqual(pulled.files['character.json'], enc('x'));
});

test('pull can skip files (images already on this device)', async () => {
  const { gh } = setup();
  await push(gh, 'main', FOLDER, await pull(gh, 'main', FOLDER), { 'character.json': enc('x'), 'images/a.webp': enc('img') }, { message: 'm', info });
  const pulled = await pull(gh, 'main', FOLDER, (p) => p.startsWith('images/'));
  assert.ok(pulled.shas.has('images/a.webp'));
  assert.ok(!('images/a.webp' in pulled.files));
});

test('nothing changed: no upload, no commit', async () => {
  const { fake, gh } = setup();
  const files = { 'character.json': enc('same') };
  await push(gh, 'main', FOLDER, await pull(gh, 'main', FOLDER), files, { message: 'm', info });
  const head = fake.state.head;
  fake.state.calls.length = 0;
  const r = await push(gh, 'main', FOLDER, await pull(gh, 'main', FOLDER), files, { message: 'm', info });
  assert.deepEqual(r.changed, []);
  assert.equal(fake.state.head, head);
  assert.ok(!fake.state.calls.some((c) => c.startsWith('POST')));
});

test('only changed files are uploaded', async () => {
  const { fake, gh } = setup();
  const img = new Uint8Array(5000).fill(7);
  await push(gh, 'main', FOLDER, await pull(gh, 'main', FOLDER), { 'character.json': enc('v1'), 'images/a.webp': img }, { message: 'm', info });
  fake.state.calls.length = 0;
  await push(gh, 'main', FOLDER, await pull(gh, 'main', FOLDER, () => true), { 'character.json': enc('v2'), 'images/a.webp': img }, { message: 'm', info });
  assert.equal(fake.state.calls.filter((c) => c === 'POST /git/blobs').length, 2, 'character.json + sync.json, not the image');
});

test('branch moved since pull: ConflictError, nothing lost online', async () => {
  const { fake, gh } = setup();
  const pulled = await pull(gh, 'main', FOLDER);
  fake.state.beforeMove = () => fake.pushFromElsewhere(`${FOLDER}notes.jsonl`, 'from phone\n');
  await assert.rejects(push(gh, 'main', FOLDER, pulled, { 'character.json': enc('pc') }, { message: 'm', info }), ConflictError);
  assert.equal((await fake.snapshot())[`${FOLDER}notes.jsonl`], 'from phone\n');
});

test('exact push removes files no longer present (replace online copy)', async () => {
  const { fake, gh } = setup();
  await push(gh, 'main', FOLDER, await pull(gh, 'main', FOLDER), { 'character.json': enc('a'), 'images/old.webp': enc('o') }, { message: 'm', info });
  await push(gh, 'main', FOLDER, await pull(gh, 'main', FOLDER), { 'character.json': enc('b') }, { message: 'm', info, exact: true });
  const files = await fake.snapshot();
  assert.ok(!(`${FOLDER}images/old.webp` in files));
  assert.equal(files[`${FOLDER}character.json`], 'b');
});

test('other characters’ folders are never touched', async () => {
  const { fake, gh } = setup();
  const other = folderFor('22222222-2222-4222-8222-222222222222');
  await push(gh, 'main', other, await pull(gh, 'main', other), { 'character.json': enc('mira') }, { message: 'm', info });
  await push(gh, 'main', FOLDER, await pull(gh, 'main', FOLDER), { 'character.json': enc('kael') }, { message: 'm', info, exact: true });
  assert.equal((await fake.snapshot())[`${other}character.json`], 'mira');
});

test('errors are friendly: bad token, missing repo, empty repo, offline', async () => {
  const fake = fakeGitHub();
  const bad = github({ token: 'nope', repo: 'h0rseGG/satchel-data', fetchFn: fake.fetchFn });
  await assert.rejects(bad.repoInfo(), (e) => e instanceof GitHubError && e.status === 401 && /token/.test(e.message));
  const missing = github({ token: 'good-token', repo: 'h0rseGG/nope', fetchFn: fake.fetchFn });
  await assert.rejects(missing.repoInfo(), (e) => e.status === 404 && /not found/.test(e.message));
  const { gh } = setup({ empty: true });
  await assert.rejects(pull(gh, 'main', FOLDER), (e) => e.status === 409 && /README/.test(e.message));
  fake.state.offline = true;
  const off = github({ token: 'good-token', repo: 'h0rseGG/satchel-data', fetchFn: fake.fetchFn });
  await assert.rejects(off.repoInfo(), (e) => e.status === 0 && /connection/.test(e.message));
});

test('remoteChanged compares against what was last synced, ignoring sync.json', async () => {
  const { gh } = setup();
  const files = { 'character.json': enc('a') };
  const pulled0 = await pull(gh, 'main', FOLDER);
  await push(gh, 'main', FOLDER, pulled0, files, { message: 'm', info });
  const last = await folderShasAfterPush(pulled0, files);
  assert.equal(remoteChanged(last, (await pull(gh, 'main', FOLDER, () => true)).shas), false);
  await push(gh, 'main', FOLDER, await pull(gh, 'main', FOLDER), { 'character.json': enc('b') }, { message: 'm', info });
  assert.equal(remoteChanged(last, (await pull(gh, 'main', FOLDER, () => true)).shas), true);
  assert.equal(remoteChanged(null, new Map()), false);
});
