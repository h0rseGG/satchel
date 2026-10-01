import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';

// demo/wren.kit (built by tests/tools/make-demo-kit.mjs) is the test
// character on the first-run screen. It must always unpack cleanly.
test('Try the demo character: one tap from the first screen, everything in place', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo character' }).click();
  const dialog = page.getByRole('dialog', { name: 'Unpack kit' });
  await expect(dialog).toContainText('Unpack Wren Ashdown');
  await expect(dialog).toContainText('45 notes, 22 entities');
  await dialog.getByRole('button', { name: 'Unpack', exact: true }).click();

  const panel = (name) => page.getByRole('region', { name });
  await expect(panel('My character')).toContainText('Exiled ranger looking for her missing sister');
  await expect(panel('My character').locator('.portrait')).toBeVisible();
  await expect(panel('Inbox')).toContainText('11 new notes');
  await expect(panel('People and places').getByRole('link', { name: /NPCs/ })).toHaveText('NPCs 8');
  await expect(panel('People and places').getByRole('link', { name: /Stubs/ })).toHaveText('Stubs 3');
  await expect(panel('Recent files').locator('.thumb')).toHaveCount(4);

  await page.goto('/#/character');
  await expect(page.getByLabel('Backstory')).toHaveValue(/Raised in the Thornwood/);
  // Six of Wren's own, plus "Pip works for Wren".
  await expect(page.getByRole('img', { name: /^Connections of Wren Ashdown/ }).locator('circle')).toHaveCount(7);

  await page.goto('/#/files');
  await page.locator('.thumb', { hasText: 'knives-letter.md' }).click();
  await expect(page.locator('.viewer__text')).toContainText('The cargo moves on the new moon');

  await page.goto('/#/');
  await enterSession(page);
  await page.getByLabel('Note').pressSequentially('grim');
  await expect(page.getByRole('region', { name: 'Recall: Grimbold Ironhand' })).toBeVisible();
});
