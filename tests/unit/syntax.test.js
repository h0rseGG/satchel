// Parses every app module. A duplicate declaration breaks the whole app,
// and browser tests only show it as timeouts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../../', import.meta.url).pathname;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.m?js$/.test(name) ? [p] : [];
  });
}

const files = [...walk(join(root, 'js')), ...walk(join(root, 'tools')), join(root, 'sw.js')];

test('there are modules to check', () => assert.ok(files.length > 5));

for (const file of files) {
  test(`parses: ${file.slice(root.length)}`, () => {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
}
