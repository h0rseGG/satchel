import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { importMapHash, cspScriptHash } from '../../tools/csp-lib.mjs';
import { VERSION } from '../../js/version.js';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('CSP hash matches the import map (run tools/csp-hash.mjs after editing it)', () => {
  const index = read('index.html');
  assert.equal(cspScriptHash(index), importMapHash(index));
});

test('import map points at files that exist', () => {
  const map = JSON.parse(read('index.html').match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  for (const path of Object.values(map.imports)) assert.ok(existsSync(new URL(path, root)), path);
});

test('VERSION is 2.N', () => {
  assert.match(VERSION, /^2\.[1-9]\d*$/);
});

test('manifest is valid and its icons exist', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.background_color, '#F6F1E4');
  assert.equal(m.theme_color, '#EDE5D2');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(existsSync(new URL(i.src, root)), i.src);
});

// The live site only has what's committed: an over-broad .gitignore line once hid
// js/ui/screens/ while every local test passed (2026-10-01).
test('no app file is git-ignored', async () => {
  const { execFileSync } = await import('node:child_process');
  const ignored = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', 'index.html', 'sw.js', 'manifest.webmanifest', 'js', 'css', 'vendor', 'icons', 'demo'], { cwd: new URL('../../', import.meta.url).pathname, encoding: 'utf8' }).trim();
  assert.equal(ignored, '');
});

test('sw.js pre-caches every app file (run node tools/sw-files.mjs after adding files)', async () => {
  const { appFiles, swBlock, readBlock } = await import('../../tools/sw-files-lib.mjs');
  const root = new URL('../../', import.meta.url).pathname;
  assert.equal(readBlock(read('sw.js')), swBlock(appFiles(root)));
});

// SPEC 10: no innerHTML (or similar) with user data. The app has no reason to use any.
test('no HTML-injection sinks in app code', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('git', ['grep', '-nE', 'innerHTML|insertAdjacentHTML|outerHTML|document\\.write|dangerouslySetInnerHTML', '--', 'js', 'sw.js', 'index.html'], { cwd: new URL('../../', import.meta.url).pathname, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.deepEqual(out.filter((l) => !/^\s*\/\//.test(l.split(':').slice(2).join(':'))), []);
});
