import { expect } from '@playwright/test';

// Fails the test on page errors and CSP violations.
export function watchProblems(page) {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content.Security.Policy/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  return problems;
}

export async function newCharacter(page, name = 'Wren Ashdown') {
  await page.goto('/');
  await page.getByLabel('Your character’s name').fill(name);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.topbar-home')).toHaveText(name);
  await page.waitForFunction(() => window.__satchel?.data);
}

export const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
