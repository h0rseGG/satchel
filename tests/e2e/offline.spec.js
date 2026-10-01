import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';
import { writeFile, rm } from 'node:fs/promises';

const box = (page) => page.getByLabel('Note');

// Wait for the service worker, then load once more under it so every app
// file passes through (and is stored by) the worker.
async function swReady(page, visible) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  await page.reload();
  await expect(visible).toBeVisible();
}

test('service worker registers and the app opens offline with its data', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('Character name').fill('Kael');
  await page.getByRole('button', { name: 'Start' }).click();
  await enterSession(page);
  await box(page).pressSequentially('note before going offline');
  await box(page).press('Enter');
  await swReady(page, box(page));

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.topbar__title')).toHaveText('Kael');
  await expect(page.locator('.note__text')).toHaveText(['note before going offline']);

  // Capture still works offline: data is local.
  await box(page).pressSequentially('note while offline');
  await box(page).press('Enter');
  await expect(page.locator('.note__text').last()).toHaveText('note while offline');
  await context.setOffline(false);
});

test('online, a changed file on the server is served fresh, not from cache', async ({ page }) => {
  // A throwaway file the server serves from the repo folder. Unique name,
  // so parallel runs of this test don't delete each other's file.
  const name = `fresh-check-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const path = `tests/e2e/${name}`;
  try {
    await writeFile(path, 'version one');
    await page.goto('/');
    await swReady(page, page.getByLabel('Character name'));
    const read = () => page.evaluate((n) => fetch(`./tests/e2e/${n}`).then((r) => r.text()), name);
    expect(await read()).toBe('version one');
    // Make sure the file's modified time moves on (1 s resolution).
    await new Promise((r) => setTimeout(r, 1100));
    await writeFile(path, 'version two');
    expect(await read()).toBe('version two');
  } finally {
    await rm(path, { force: true });
  }
});
