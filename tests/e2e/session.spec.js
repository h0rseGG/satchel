import { test, expect } from '@playwright/test';

const box = (page) => page.getByLabel('Note');
const label = (page) => page.locator('.topbar__session');

async function start(page) {
  await page.goto('/');
  await page.getByLabel('Character name').fill('Kael');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(box(page)).toBeFocused();
}

async function say(page, text) {
  await box(page).pressSequentially(text);
  await box(page).press('Enter');
  await expect(box(page)).toHaveValue('');
}

async function menu(page, item) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

const lastNote = (page) => page.evaluate(() => window.__satchel.db.notes.orderBy('created_at').last());

test('Start session from the menu: label shows, notes are tagged in', async ({ page }) => {
  await start(page);
  await expect(label(page)).toHaveCount(0);
  await say(page, 'before the game');
  expect((await lastNote(page)).mode).toBe('out');

  await menu(page, 'Start session');
  await expect(label(page)).toHaveText('In session');
  await say(page, 'during the game');
  expect((await lastNote(page)).mode).toBe('in');

  await page.reload();
  await expect(label(page)).toHaveText('In session');
});

test('End session with unsaved changes nudges a backup; Pack kit downloads', async ({ page }) => {
  await start(page);
  await menu(page, 'Start session');
  await say(page, 'met @Grimbold');
  await menu(page, 'End session');
  await expect(label(page)).toHaveCount(0);

  const nudge = page.getByRole('dialog', { name: 'Session ended' });
  await expect(nudge).toContainText('Not backed up. Pack your kit now');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    nudge.getByRole('button', { name: 'Pack kit' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.kit$/);
  await expect(page.locator('.topbar .badge')).toHaveText('Backed up');
  await say(page, 'after the game');
  expect((await lastNote(page)).mode).toBe('out');
});

test('No nudge when already backed up; Not now closes it otherwise', async ({ page }) => {
  await start(page);
  await say(page, 'x');
  await Promise.all([page.waitForEvent('download'), page.locator('.topbar .badge').click()]);
  await menu(page, 'Start session');
  await menu(page, 'End session');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await menu(page, 'Start session');
  await say(page, 'y');
  await menu(page, 'End session');
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('A session idle for 12 h ends by itself, live, with a message', async ({ page }) => {
  await start(page);
  await menu(page, 'Start session');
  await expect(label(page)).toHaveText('In session');
  await page.evaluate(() => window.__satchel.db.meta.put({
    key: 'mode_since', value: new Date(Date.now() - 13 * 3600 * 1000).toISOString(),
  }));
  await expect(label(page)).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('ended automatically');
});

test('An idle session found when the app opens is ended too', async ({ page }) => {
  await start(page);
  await menu(page, 'Start session');
  await expect(label(page)).toHaveText('In session');
  // Back-date while the app is closed, as if the phone sat in a pocket overnight.
  await page.goto('/tests/e2e/blank.html');
  await page.evaluate(async () => {
    const { default: Dexie } = await import('/vendor/dexie.mjs');
    const d = await new Dexie('satchel').open();
    await d.table('meta').put({ key: 'mode_since', value: new Date(Date.now() - 13 * 3600 * 1000).toISOString() });
    d.close();
  });
  await page.goto('/');
  await expect(page.locator('.topbar__title')).toHaveText('Kael');
  await expect(label(page)).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('ended automatically');
});

test('Session mode is not exported in kits', async ({ page }) => {
  await start(page);
  await menu(page, 'Start session');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.topbar .badge').click()]);
  const { readFile } = await import('node:fs/promises');
  const { unpackKit } = await import('../../js/kit.js');
  const { data } = unpackKit(new Uint8Array(await readFile(await download.path())));
  expect(JSON.stringify(data)).not.toContain('mode_since');
});
