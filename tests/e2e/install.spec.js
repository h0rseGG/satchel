import { test, expect } from '@playwright/test';

// Installable: a linked, valid manifest whose icons all load.
test('manifest is linked, valid, and its icons load', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await page.evaluate(async (h) => (await fetch(h)).json(), href);
  expect(manifest).toMatchObject({ name: 'Satchel', start_url: './', scope: './', display: 'standalone' });
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const size = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return `${img.naturalWidth}x${img.naturalHeight}`;
    }, icon.src);
    expect(size).toBe(icon.sizes);
  }
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'icons/icon-32.png');
});
