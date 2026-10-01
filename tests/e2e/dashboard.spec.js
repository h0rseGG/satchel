import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';

const box = (page) => page.getByLabel('Note');

async function start(page, name = 'Kael') {
  await page.goto('/');
  await page.getByLabel('Character name').fill(name);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('region', { name: 'Inbox' })).toBeVisible();
}

async function quickNote(page, text) {
  await box(page).pressSequentially(text);
  await box(page).press('Enter');
  await expect(box(page)).toHaveValue('');
}

test('a new character lands on the dashboard with its panels', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('region', { name: 'My character' })).toContainText('Kael');
  await expect(page.getByRole('region', { name: 'Inbox' })).toContainText('0 new notes');
  await expect(page.getByRole('region', { name: 'People and places' })).toContainText('NPCs 0');
  await expect(page.getByRole('region', { name: 'Recent files' })).toBeVisible();
  await expect(page.locator('.topbar__session')).toHaveCount(0);
});

test('quick note goes to the Inbox; a new @name shows up as a stub', async ({ page }) => {
  await start(page);
  await quickNote(page, 'remember to ask @Grimbold about the vault');
  await expect(page.getByRole('status')).toContainText('Note saved to your Inbox');
  await expect(page.getByRole('region', { name: 'Inbox' })).toContainText('1 new note');
  await expect(page.getByRole('region', { name: 'People and places' }).getByRole('link', { name: /Stubs/ })).toHaveText('Stubs 1');
  const note = await page.evaluate(() => window.__satchel.db.notes.orderBy('created_at').last());
  expect(note.mode).toBe('out');
});

test('the player character is not counted in People & places', async ({ page }) => {
  await start(page);
  await quickNote(page, '@Kael rests');
  await expect(page.getByRole('region', { name: 'People and places' }).getByRole('link', { name: /Characters/ })).toHaveText('Characters 0');
});

test('Start session switches to the capture screen; End session comes back', async ({ page }) => {
  await start(page);
  await enterSession(page);
  await expect(page.getByRole('region', { name: 'Inbox' })).toHaveCount(0);
  await expect(page.getByPlaceholder(/Type a note/)).toBeVisible();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('region', { name: 'Inbox' })).toBeVisible();
});

test('the character name in the top bar leads home; unknown addresses show the dashboard', async ({ page }) => {
  await start(page);
  await page.goto('/#/nowhere/at/all');
  await expect(page.getByRole('region', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Kael' })).toHaveAttribute('href', '#/');
});

test('dashboard works on a phone-width screen', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 800 });
  await start(page);
  for (const name of ['My character', 'Inbox', 'People and places', 'Recent files']) {
    const box = await page.getByRole('region', { name }).boundingBox();
    expect(box.width).toBeLessThanOrEqual(412);
  }
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(412);
});
