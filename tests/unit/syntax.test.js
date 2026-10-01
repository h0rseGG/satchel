// Every app module must parse. A syntax error (e.g. declaring the same name
// twice) stops the whole app loading, and browser tests only show it as
// timeouts; this catches it in milliseconds with a clear message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await jsFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('all app modules parse', async () => {
  const files = [...await jsFiles('js'), 'sw.js'];
  assert.ok(files.length > 20);
  for (const f of files) {
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (err) {
      assert.fail(`${f}: ${err.stderr.toString().split('\n').slice(0, 5).join('\n')}`);
    }
  }
});
