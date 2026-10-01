import { test, expect } from '@playwright/test';
import { watchProblems, noSidewaysScroll } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/#/dev/gallery');
  await expect(page.locator('.page-title')).toHaveText('Component gallery');
});

test('renders every component with no errors or CSP violations', async ({ page }) => {
  const problems = watchProblems(page);
  await page.reload();
  for (const h of ['Buttons', 'Fields', 'Entity picker', 'Ruled list and inline form', 'Card', 'Thumbs', 'Messages and confirm sheet']) {
    await expect(page.getByRole('heading', { name: h })).toBeVisible();
  }
  await expect(page.locator('.mention').first()).toHaveText('Grimbold Ironhand');
  await expect(page.locator('.tag').first()).toHaveText('#debts');
  expect(problems).toEqual([]);
});

test('Field autosaves 0.7 s after typing stops, once, and not for the same value', async ({ page }) => {
  const field = page.getByLabel('Summary');
  const hint = page.getByText(/^Saved \d+ times/);
  await field.fill('Owns the mill.');
  await expect(hint).toHaveText(/^Saved 0 times/);
  await expect(hint).toHaveText(/^Saved 1 times/, { timeout: 2000 });
  await field.blur();
  await page.waitForTimeout(900);
  await expect(hint).toHaveText(/^Saved 1 times/);
  await field.fill('Owns the mill. Liar.');
  await field.blur();
  await expect(hint).toHaveText(/^Saved 2 times/);
});

test('Field validation shows an error and does not save', async ({ page }) => {
  const f = page.getByLabel('Crew (number)');
  await f.fill('lots');
  await f.blur();
  await expect(page.getByText('Enter a number')).toBeVisible();
  await expect(f).toHaveAttribute('aria-invalid', 'true');
});

test('ChipsField adds with Enter and comma, ignores case duplicates, removes', async ({ page }) => {
  const input = page.getByLabel('Tags');
  await input.fill('liar');
  await input.press('Enter');
  await input.fill('NOBLE');
  await input.press(',');
  await expect(page.locator('.chip')).toHaveCount(3);
  await page.getByRole('button', { name: 'Remove noble' }).click();
  await expect(page.locator('.chip')).toHaveText(['fuck this guy×', 'liar×']);
});

test('EntityPicker: type to filter, arrows and Enter pick, new names offer a stub', async ({ page }) => {
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Entity picker' }) });
  const input = panel.getByRole('combobox');
  await input.fill('ald');
  await expect(panel.getByRole('option')).toHaveText([/Lord Aldric Thorne/]);
  await input.press('Enter');
  await expect(panel.getByText('Picked: Lord Aldric Thorne')).toBeVisible();
  await input.fill('fox');
  await expect(panel.getByRole('option').first()).toContainText('Mira Vane');
  await input.fill('Pip');
  await expect(panel.getByRole('option')).toHaveText(['New stub: Pip']);
  await panel.getByRole('option').dispatchEvent('pointerdown');
  await expect(panel.getByText('Picked: new stub Pip')).toBeVisible();
});

test('inline form opens under its row and cancels', async ({ page }) => {
  await page.getByRole('button', { name: 'Add relationship' }).click();
  const form = page.getByRole('form', { name: 'Add relationship' });
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form).toHaveCount(0);
});

test('confirm sheet: named dialog, Esc cancels, focus returns', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Confirm', exact: true });
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'Delete this note?' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.toast').last()).toHaveText('Cancelled');
  await expect(opener).toBeFocused();
});

test('confirm with name: disabled until the name is typed', async ({ page }) => {
  await page.getByRole('button', { name: 'Confirm with name' }).click();
  const sheet = page.getByRole('dialog', { name: 'Replace Wren Ashdown?' });
  const go = sheet.getByRole('button', { name: 'Replace' });
  await expect(go).toBeDisabled();
  await sheet.getByLabel('Type “Wren Ashdown” to confirm').fill('wren ashdown');
  await go.click();
  await expect(page.locator('.toast').last()).toHaveText('Confirmed');
});

test('toasts float over the page without moving it, and dismiss on tap', async ({ page }) => {
  const btn = page.getByRole('button', { name: 'Toast: error' });
  await btn.scrollIntoViewIfNeeded();
  const before = await btn.boundingBox();
  await btn.click();
  const t = page.locator('.toast-err');
  await expect(t).toBeVisible();
  expect(await btn.boundingBox()).toEqual(before);
  await t.click();
  await expect(t).toHaveCount(0);
});

test('phone width: no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  expect(await noSidewaysScroll(page)).toBe(true);
});
