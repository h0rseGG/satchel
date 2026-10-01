import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, fileExt, fitSize, formatSize, FILE_PATH } from '../../js/fileRules.js';
import { makeFile } from '../../js/model.js';

test('classify: images and .txt/.md only', () => {
  assert.equal(classify('map.png', 'image/png'), 'image');
  assert.equal(classify('PHOTO.JPG', ''), 'image');
  assert.equal(classify('notes.txt', 'text/plain'), 'text');
  assert.equal(classify('lore.md', ''), 'text');
  assert.equal(classify('lore.markdown', 'text/markdown'), 'text');
  assert.equal(classify('rules.pdf', 'application/pdf'), null);
  assert.equal(classify('virus.exe', ''), null);
  assert.equal(classify('page.html', 'text/html'), null, 'html is not plain text');
});

test('fileExt follows kind, mime and name', () => {
  assert.equal(fileExt({ kind: 'image', mime: 'image/webp' }), 'webp');
  assert.equal(fileExt({ kind: 'image', mime: 'image/jpeg' }), 'jpg');
  assert.equal(fileExt({ kind: 'text', name: 'Lore.MD' }), 'md');
  assert.equal(fileExt({ kind: 'text', name: 'list' }), 'txt');
});

test('FILE_PATH accepts only known extensions and uuid names', () => {
  assert.ok(FILE_PATH.test('files/11111111-1111-4111-8111-111111111111.webp'));
  assert.ok(!FILE_PATH.test('files/11111111-1111-4111-8111-111111111111.exe'));
  assert.ok(!FILE_PATH.test('files/../evil.txt'));
});

test('fitSize keeps shape and never enlarges', () => {
  assert.deepEqual(fitSize(3000, 1000), { width: 2560, height: 853 });
  assert.deepEqual(fitSize(1000, 5120), { width: 500, height: 2560 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});

test('formatSize', () => {
  assert.equal(formatSize(500), '500 B');
  assert.equal(formatSize(2048), '2 KB');
  assert.equal(formatSize(10 * 1024 * 1024), '10.0 MB');
});

test('makeFile validates name and kind', () => {
  const f = makeFile({ name: ' map.png ', kind: 'image', mime: 'image/webp', size: 10 });
  assert.equal(f.name, 'map.png');
  assert.equal(f.entity_id, null);
  assert.throws(() => makeFile({ name: '', kind: 'image' }));
  assert.throws(() => makeFile({ name: 'x', kind: 'pdf' }));
});
