import { expect } from '@playwright/test';

// New characters land on the out-of-session dashboard. Tests of the capture
// screen switch to In session first.
export async function enterSession(page) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Start session' }).click();
  await expect(page.locator('.topbar__session')).toHaveText('In session');
  await expect(page.getByLabel('Note')).toBeVisible();
}
