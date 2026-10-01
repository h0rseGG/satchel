import { test, expect } from '@playwright/test';
import { VERSION } from '../../js/version.js';

// Collects anything that would mean the app is broken but still half-renders.
async function openApp(page) {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content-Security-Policy|Content Security Policy/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto('/');
  await expect(page.locator('.topbar-home')).toHaveText('Satchel');
  return problems;
}

test('boots under the CSP with no errors or violations', async ({ page }) => {
  const problems = await openApp(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
  expect(problems).toEqual([]);
});

test('CSP is enforced: an injected inline script does not run', async ({ page }) => {
  await openApp(page);
  const ran = await page.evaluate(async () => {
    window.__inlineRan = false;
    const el = document.createElement('script');
    el.textContent = 'window.__inlineRan = true';
    document.body.append(el);
    await new Promise((r) => setTimeout(r, 200));
    return window.__inlineRan;
  });
  expect(ran).toBe(false);
  expect((await page.evaluate(() => window.__cspViolations)).join()).toContain('script-src');
});

test('menu shows the version', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('menu')).toContainText(`Satchel v${VERSION}`);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('bundled heading fonts load', async ({ page }) => {
  await openApp(page);
  const ok = await page.evaluate(async () => {
    await document.fonts.load('20px "IM Fell English"');
    await document.fonts.load('20px "IM Fell English SC"');
    return document.fonts.check('20px "IM Fell English"') && document.fonts.check('20px "IM Fell English SC"');
  });
  expect(ok).toBe(true);
});

test('phone width: no sideways scroll, top bar on one line', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await openApp(page);
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
  const bar = await page.locator('.topbar').boundingBox();
  expect(bar.height).toBeLessThan(60);
});

test('manifest and icons are served', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  for (const icon of manifest.icons) {
    const r = await request.get(`/${icon.src}`);
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()['content-type']).toBe('image/png');
  }
});

test('opens offline after one online visit, styled', async ({ page, context }) => {
  await openApp(page);
  // Wait for the state, not the event (v1 lesson 7): the worker is active and has pre-cached.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => (await (await caches.open('satchel-v2')).keys()).length)).toBeGreaterThan(20);
  await context.setOffline(true);
  // A new page in the same profile: nothing from this tab's memory cache.
  const offline = await context.newPage();
  await offline.goto('/');
  await expect(offline.locator('.topbar-home')).toHaveText('Satchel');
  await expect(offline.locator('.page-title')).toHaveText('Satchel');
  expect(await offline.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 241, 228)');
  expect(await offline.evaluate(async () => (await document.fonts.load('20px "IM Fell English"')).length > 0)).toBe(true);
});
