import { test, expect } from '@playwright/test';
import { newCharacter, noSidewaysScroll } from './helpers.js';
import { png } from './png.js';

const pc = (page) => page.evaluate(async () => window.__satchel.db.entities.get((await window.__satchel.data.getMeta('bundle')).pc_entity_id));

test.beforeEach(async ({ page }) => {
  await newCharacter(page, 'Wren Ashdown');
});

test('profile sections save in place, each with its own time', async ({ page }) => {
  await page.goto('/#/character');
  await expect(page.locator('.topbar-crumbs')).toHaveText('Home › My character');
  await page.getByLabel('Concept').fill('Exiled ranger looking for her sister');
  await page.getByLabel('Concept').blur();
  await page.getByLabel('Backstory').fill('Grew up in Saltmarsh.');
  await page.getByLabel('Backstory').blur();
  await expect.poll(async () => (await pc(page)).profile.backstory).toBe('Grew up in Saltmarsh.');
  const p = await pc(page);
  expect(p.profile.concept).toBe('Exiled ranger looking for her sister');
  expect(Object.keys(p.profile_times).sort()).toEqual(['backstory', 'concept']);
  await page.reload();
  await expect(page.locator('.character-concept')).toHaveText('Exiled ranger looking for her sister');
});

test('D&D Beyond link: checked; the button shows on the character page, Home and the session overview', async ({ page }) => {
  await page.goto('/#/character');
  const f = page.getByLabel('D&D Beyond link');
  await f.fill('https://evil.example.com/characters/1');
  await f.blur();
  await expect(page.getByText('Paste a link from dndbeyond.com or ddb.ac')).toBeVisible();
  expect((await pc(page)).dndbeyond_url).toBe('');
  await f.fill('https://www.dndbeyond.com/characters/12345678');
  await f.blur();
  const btn = (p) => p.getByRole('link', { name: 'Open in D&D Beyond' });
  await expect(btn(page)).toHaveAttribute('href', 'https://www.dndbeyond.com/characters/12345678');
  await expect(btn(page)).toHaveAttribute('target', '_blank');
  await page.goto('/#/');
  await expect(btn(page)).toBeVisible();
  await page.locator('.session-btn').click();
  await page.locator('.topbar-home').click();
  await expect(btn(page)).toBeVisible();
});

test('ddb.ac share links are accepted', async ({ page }) => {
  await page.goto('/#/character');
  await page.getByLabel('D&D Beyond link').fill('https://ddb.ac/characters/6648868/5liMnV');
  await page.getByLabel('D&D Beyond link').blur();
  await expect(page.getByRole('link', { name: 'Open in D&D Beyond' })).toBeVisible();
});

test('portrait: images are re-encoded (WebP, longest side 2560) and show on Home', async ({ page }) => {
  await page.goto('/#/character');
  await page.locator('.portrait input[type=file]').setInputFiles({ name: 'wren.png', mimeType: 'image/png', buffer: png(3000, 1500) });
  await expect(page.getByText('Picture saved.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Picture of Wren Ashdown' })).toBeVisible();
  const file = await page.evaluate(async () => {
    const p = await window.__satchel.db.entities.get((await window.__satchel.data.getMeta('bundle')).pc_entity_id);
    return window.__satchel.db.files.get(p.portrait_file_id);
  });
  expect([file.kind, file.mime, file.width, file.height, file.name]).toEqual(['image', 'image/webp', 2560, 1280, 'wren.webp']);
  await page.goto('/#/');
  await expect(page.getByRole('img', { name: 'Picture of Wren Ashdown' })).toBeVisible();
  await page.goto('/#/character');
  await page.getByRole('button', { name: 'Remove picture' }).click();
  await expect(page.getByRole('img', { name: 'Picture of Wren Ashdown' })).toHaveCount(0);
});

test('portrait refusals: text files, too big, not an image', async ({ page }) => {
  await page.goto('/#/character');
  const input = page.locator('.portrait input[type=file]');
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(page.getByText('Pictures must be images.')).toBeVisible();
  await input.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByText('That file is over 10 MB.')).toBeVisible();
  await input.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  await expect(page.getByText('That image couldn’t be read.')).toBeVisible();
  expect(await page.evaluate(() => window.__satchel.db.files.count())).toBe(0);
});

test('other entities get a picture too; your own entity address opens the character page', async ({ page }) => {
  const g = await page.evaluate(() => window.__satchel.data.createEntity({ name: 'Grimbold', type_id: 'type-npc' }));
  await page.goto(`/#/entity/${g.id}`);
  await page.locator('.portrait input[type=file]').setInputFiles({ name: 'grim.png', mimeType: 'image/png', buffer: png(40, 40) });
  await expect(page.getByRole('img', { name: 'Picture of Grimbold' })).toBeVisible();
  const me = await pc(page);
  await page.goto(`/#/entity/${me.id}`);
  await expect(page).toHaveURL(/#\/character$/);
});

test('phone width: character page has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await page.goto('/#/character');
  await expect(page.getByLabel('Backstory')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});
