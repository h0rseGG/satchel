import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';
import { readFile } from 'node:fs/promises';
import { unpackKit } from '../../js/kit.js';

const box = (page) => page.getByLabel('Note');

async function start(page) {
  await page.goto('/');
  await page.getByLabel('Character name').fill('Kael Stormborn');
  await page.getByRole('button', { name: 'Start' }).click();
  await enterSession(page);
  await expect(box(page)).toBeFocused();
}

async function say(page, text) {
  await box(page).pressSequentially(text);
  await box(page).press('Enter');
  await expect(box(page)).toHaveValue('');
}

async function packKit(page) {
  await page.getByRole('button', { name: 'Menu' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Pack kit/ }).click(),
  ]);
  return download;
}

test('Pack kit downloads a .kit that unpacks to what is in the app', async ({ page }) => {
  await start(page);
  await say(page, 'met @Grimbold at the forge');
  await say(page, '@Lord_Aldric owns the mill');

  const download = await packKit(page);
  expect(download.suggestedFilename()).toMatch(/^kael-stormborn-\d{4}-\d{2}-\d{2}-\d{4}\.kit$/);

  const { data, report } = unpackKit(new Uint8Array(await readFile(await download.path())));
  expect(report.skipped).toEqual([]);
  const db = await page.evaluate(async () => {
    const d = window.__satchel.db;
    return {
      bundle: (await d.meta.get('bundle_id')).value,
      pc: (await d.meta.get('pc_entity_id')).value,
      entities: await d.entities.toArray(),
      notes: await d.notes.toArray(),
    };
  });
  expect(data.bundle_id).toBe(db.bundle);
  expect(data.pc_entity_id).toBe(db.pc);
  expect(new Set(data.entities.map((e) => e.name))).toEqual(new Set(['Kael Stormborn', 'Grimbold', 'Lord Aldric']));
  expect(data.notes.map((n) => n.id).sort()).toEqual(db.notes.map((n) => n.id).sort());
});

test('backup badge goes from "Not backed up" to "Backed up", then counts changes', async ({ page }) => {
  await start(page);
  await expect(page.locator('.topbar .badge')).toHaveText('Not backed up');
  await say(page, 'a note');
  await packKit(page);
  await expect(page.locator('.topbar .badge')).toHaveText('Backed up');
  await expect(page.getByRole('status')).toContainText('Kit packed: kael-stormborn-');
  await say(page, 'another note');
  await expect(page.locator('.topbar .badge')).toHaveText('1 change since backup');
});

test('tapping the badge packs a kit', async ({ page }) => {
  await start(page);
  await say(page, 'a note');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.topbar .badge').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.kit$/);
  await expect(page.locator('.topbar .badge')).toHaveText('Backed up');
});

test('badge colour follows the age of the oldest unsaved change', async ({ page }) => {
  const badge = page.locator('.topbar .badge');
  await start(page);
  await expect(badge).toHaveClass(/badge--err/);   // never backed up
  await packKit(page);
  await expect(badge).toHaveClass(/badge--ok/);
  await say(page, 'fresh change');
  await expect(badge).toHaveClass(/badge--neutral/);

  const age = (hours) => page.evaluate((h) => window.__satchel.db.meta.put({
    key: 'first_change_at', value: new Date(Date.now() - h * 3600 * 1000).toISOString(),
  }), hours);
  await age(25);
  await expect(badge).toHaveClass(/badge--warn/);
  await age(24 * 8);
  await expect(badge).toHaveClass(/badge--err/);
  await expect(badge).toHaveText('1 change since backup');
});

test('menu closes when tapping elsewhere', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await box(page).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
});
