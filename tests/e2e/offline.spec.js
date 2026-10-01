import { test, expect } from '@playwright/test';
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
  // A throwaway file the server serves from the repo folder.
  const path = 'tests/e2e/fresh-check.txt';
  try {
    await writeFile(path, 'version one');
    await page.goto('/');
    await swReady(page, page.getByLabel('Character name'));
    const read = () => page.evaluate(() => fetch('./tests/e2e/fresh-check.txt').then((r) => r.text()));
    expect(await read()).toBe('version one');
    // Make sure the file's modified time moves on (1 s resolution).
    await new Promise((r) => setTimeout(r, 1100));
    await writeFile(path, 'version two');
    expect(await read()).toBe('version two');
  } finally {
    await rm(path, { force: true });
  }
});
