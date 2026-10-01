import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';

// Every page at Pixel width: nothing may scroll sideways.
test('no page scrolls sideways at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await page.goto('/');
  await page.getByLabel('Character name').fill('Kael Stormborn of the Thornwood');
  await page.getByRole('button', { name: 'Start' }).click();
  const box = page.getByLabel('Note');
  await box.pressSequentially('met @Grimbold_Ironhand_the_Unusually_Long_Named and @Mira');
  await box.press('Enter');
  const g = await page.evaluate(async () =>
    (await window.__satchel.db.entities.toArray()).find((e) => e.name.startsWith('Grimbold')));

  const pages = ['/', '/character', '/inbox', '/log', '/files', '/list/stub', `/entity/${g.id}`];
  for (const p of pages) {
    await page.goto(`/#${p}`);
    await expect(page.locator('main')).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `sideways scroll on #${p}`).toBeLessThanOrEqual(412);
  }

  await page.goto('/#/');
  await enterSession(page);
  await box.pressSequentially('grimbold');
  expect(await page.evaluate(() => document.documentElement.scrollWidth), 'capture screen').toBeLessThanOrEqual(412);
});
