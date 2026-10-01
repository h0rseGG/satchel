import { test, expect } from '@playwright/test';
import { newCharacter, noSidewaysScroll } from './helpers.js';
import { png } from './png.js';

const img = (name = 'map.png', w = 800, h = 600) => ({ name, mimeType: 'image/png', buffer: png(w, h) });
const txt = (name, body) => ({ name, mimeType: name.endsWith('.md') ? 'text/markdown' : 'text/plain', buffer: Buffer.from(body) });
const files = (page) => page.evaluate(() => window.__satchel.db.files.toArray());

test.beforeEach(async ({ page }) => {
  await newCharacter(page, 'Wren Ashdown');
});

test('Files: empty state; add several at once; refused ones get their own message', async ({ page }) => {
  await page.goto('/#/files');
  await expect(page.getByText('No maps or scraps yet.')).toBeVisible();
  await page.locator('.add-files input[type=file]').setInputFiles([img('map.png'), txt('ledger.txt', 'A.T. 20gp'), txt('bad.pdf', '%PDF')]);
  await expect(page.getByText('bad.pdf: Satchel takes images, and .txt or .md text files.')).toBeVisible();
  await expect(page.getByText('2 files added.')).toBeVisible();
  await expect(page.locator('.file-tile-name')).toHaveText(['ledger.txt', 'map.webp']);
  expect(await noSidewaysScroll(page)).toBe(true);
});

test('text files are checked as UTF-8 and shown as plain text, never HTML', async ({ page }) => {
  await page.goto('/#/files');
  const input = page.locator('.add-files input[type=file]');
  await input.setInputFiles({ name: 'latin1.txt', mimeType: 'text/plain', buffer: Buffer.from([0x63, 0x61, 0x66, 0xe9]) });
  await expect(page.getByText('latin1.txt: That text file isn’t plain UTF-8 text.')).toBeVisible();
  await input.setInputFiles(txt('song.md', '# The Drowned Lantern\n<script>window.__pwned = 1</script>\n<b>not bold</b>'));
  await expect(page.locator('.page-title')).toHaveText('song.md', { message: 'one file added opens it' });
  const pre = page.locator('.file-view-text');
  await expect(pre).toContainText('<b>not bold</b>');
  await expect(pre.locator('b')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('viewer: rename and caption in place, attach, use as picture, download, delete', async ({ page }) => {
  const g = await page.evaluate(() => window.__satchel.data.createEntity({ name: 'Grimbold', type_id: 'type-npc' }));
  await page.goto('/#/files');
  await page.locator('.add-files input[type=file]').setInputFiles(img('forge.png', 300, 200));
  await expect(page.locator('.page-title')).toHaveText('forge.webp');
  await expect(page.locator('.file-meta')).toContainText('300 × 200');
  await page.getByLabel('Name').fill('Grimbold’s forge.webp');
  await page.getByLabel('Name').blur();
  await page.getByLabel('Caption').fill('Next to the mill');
  await page.getByLabel('Caption').blur();
  await expect(page.locator('.file-view figcaption')).toHaveText('Next to the mill');
  await page.getByRole('button', { name: 'Attach to…' }).click();
  await page.getByRole('combobox', { name: 'Attach to' }).fill('grim');
  await page.getByRole('combobox', { name: 'Attach to' }).press('Enter');
  await expect(page.locator('.field a.mention')).toHaveText('Grimbold');
  await page.getByRole('button', { name: 'Use as Grimbold’s picture' }).click();
  await expect(page.getByText('Now Grimbold’s picture.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe('Grimbold’s forge.webp');
  // The entity shows it in Files and as its picture.
  await page.goto(`/#/entity/${g.id}`);
  await expect(page.getByRole('img', { name: 'Picture of Grimbold' })).toBeVisible();
  await expect(page.locator('#entity-files').locator('xpath=ancestor::section').locator('.file-tile-name')).toHaveText(['Grimbold’s forge.webp']);
  // Delete: confirmed; the picture goes too.
  await page.locator('.file-tile-link').click();
  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('dialog', { name: 'Delete Grimbold’s forge.webp?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.page-title')).toHaveText('Grimbold');
  await expect(page.getByRole('img', { name: 'Picture of Grimbold' })).toHaveCount(0);
  const [f] = await files(page);
  expect(f.deleted).toBe(true);
  expect(await page.evaluate((id) => window.__satchel.db.blobs.get(id), f.id)).toBeUndefined();
});

test('Add file on an entity page attaches it to that entity', async ({ page }) => {
  const g = await page.evaluate(() => window.__satchel.data.createEntity({ name: 'Mira', type_id: 'type-npc' }));
  await page.goto(`/#/entity/${g.id}`);
  await page.locator('#entity-files').locator('xpath=ancestor::section').locator('input[type=file]').setInputFiles(txt('mira.md', 'knew mum'));
  await expect(page.locator('.file-tile-name')).toHaveText(['mira.md']);
  expect((await files(page))[0].entity_id).toBe(g.id);
});

test('Home shows recent files', async ({ page }) => {
  await page.goto('/#/files');
  await page.locator('.add-files input[type=file]').setInputFiles([img('a.png', 20, 20), img('b.png', 20, 20)]);
  await expect(page.getByText('2 files added.')).toBeVisible();
  await page.goto('/#/');
  await expect(page.locator('#home-files').locator('xpath=ancestor::section').locator('.file-tile')).toHaveCount(2);
});

test('phone width: viewer has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await page.goto('/#/files');
  await page.locator('.add-files input[type=file]').setInputFiles(img('wide.png', 2000, 400));
  await expect(page.locator('.file-view-img')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});
