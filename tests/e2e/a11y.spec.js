// Every screen, both widths, with the demo loaded (SPEC 10): every control labelled,
// images with alt text, dialogs named, one h1, and no sideways scroll at 412 px.
import { test, expect } from '@playwright/test';

async function audit(page) {
  return page.evaluate(() => {
    const problems = [];
    const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const hidden = (el) => el.closest('[aria-hidden="true"]');
    const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const nameOf = (el) => {
      if (el.getAttribute('aria-label')?.trim()) return el.getAttribute('aria-label');
      const lb = el.getAttribute('aria-labelledby');
      if (lb) return lb.split(' ').map((id) => text(document.getElementById(id))).join(' ').trim();
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l && text(l)) return text(l);
      }
      const wrap = el.closest('label');
      if (wrap && text(wrap)) return text(wrap);
      if (['BUTTON', 'A', 'SUMMARY'].includes(el.tagName.toUpperCase())) {
        const t = text(el) || el.querySelector('img')?.alt || el.querySelector('title')?.textContent;
        if (t) return t;
      }
      return el.getAttribute('title') || '';
    };
    for (const el of document.querySelectorAll('button, input, select, textarea, a[href], [role="combobox"], [role="option"]')) {
      if (!visible(el) || hidden(el) || el.type === 'hidden') continue;
      if (el.getAttribute('role') === 'option') { if (!text(el)) problems.push('option without text'); continue; }
      const cls = (el.getAttribute('class') ?? '').split(' ')[0];
      if (!nameOf(el)) problems.push(`unlabelled ${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`);
    }
    for (const img of document.querySelectorAll('img')) if (visible(img) && !img.alt) problems.push('img without alt');
    for (const d of document.querySelectorAll('[role="dialog"]')) if (!nameOf(d)) problems.push('unnamed dialog');
    const h1 = [...document.querySelectorAll('h1')].filter(visible).length;
    if (h1 !== 1) problems.push(`${h1} h1 elements`);
    if (document.documentElement.lang !== 'en-AU') problems.push('no lang');
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) problems.push('sideways scroll');
    return problems;
  });
}

for (const [label, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 412, height: 860 }]]) {
  test(`${label}: every screen passes the audit`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    expect(await audit(page), 'first run').toEqual([]);
    await page.getByRole('button', { name: 'Try the demo character' }).click();
    await expect(page.locator('.topbar-home')).toHaveText('Wren Ashdown');
    const ids = await page.evaluate(async () => {
      const db = window.__satchel.db;
      const grim = await db.entities.filter((e) => e.name === 'Grimbold Ironhand').first();
      const gull = await db.entities.filter((e) => e.name === 'The Gull’s Wake').first();
      const file = await db.files.toCollection().first();
      return { grim: grim.id, gull: gull.id, file: file.id, ship: gull.type_id };
    });
    const screens = ['#/', '#/inbox', '#/notes', '#/notes?tag=debts', '#/world', '#/world/type-npc', `#/world/${ids.ship}`, '#/world/stubs', `#/entity/${ids.grim}`, `#/entity/${ids.gull}`, '#/character', '#/files', `#/files/${ids.file}`, '#/settings'];
    for (const h of screens) {
      await page.goto(`/${h}`);
      await expect(page.locator('h1')).toBeVisible();
      await page.waitForTimeout(150);
      expect(await audit(page), h).toEqual([]);
    }
    // Open states: menu, help, inline forms, the session and its overview.
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Menu' }).click();
    expect(await audit(page), 'menu').toEqual([]);
    await page.getByRole('menuitem', { name: 'How it works' }).click();
    expect(await audit(page), 'help').toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await page.goto('/#/inbox');
    await page.getByRole('button', { name: 'Add as relationship' }).first().click();
    expect(await audit(page), 'inbox relationship form').toEqual([]);
    await page.goto('/#/world');
    await page.getByRole('button', { name: 'Edit' }).first().click();
    expect(await audit(page), 'type editor').toEqual([]);
    await page.locator('.session-btn').click();
    const box = page.getByRole('combobox', { name: 'Note' });
    await box.pressSequentially('grimbold and @mir');
    await expect(page.locator('.recall-card').first()).toBeVisible();
    expect(await audit(page), 'session typing').toEqual([]);
    await page.locator('.topbar-home').click();
    expect(await audit(page), 'overview').toEqual([]);
  });
}
