import { test, expect } from '@playwright/test';

async function startCharacter(page, name = 'Kael') {
  await page.goto('/');
  await page.getByLabel('Character name').fill(name);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.topbar__title')).toHaveText(name);
}

const box = (page) => page.getByLabel('Note');

test('first run: empty app asks for a character name', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Character name')).toBeVisible();
});

test('capture box is focused after start', async ({ page }) => {
  await startCharacter(page);
  await expect(box(page)).toBeFocused();
});

test('Enter saves a note with a timestamp and clears the box', async ({ page }) => {
  await startCharacter(page);
  await box(page).fill('Met a dwarf smith in Brindol');
  await box(page).press('Enter');
  await expect(page.locator('.note__text')).toHaveText(['Met a dwarf smith in Brindol']);
  await expect(page.locator('.note__time')).toHaveText(/^\d{2}:\d{2}$/);
  await expect(box(page)).toHaveValue('');
  await expect(box(page)).toBeFocused();
});

test('Shift+Enter adds a line instead of saving', async ({ page }) => {
  await startCharacter(page);
  await box(page).pressSequentially('line one');
  await box(page).press('Shift+Enter');
  await box(page).pressSequentially('line two');
  await expect(page.locator('.note')).toHaveCount(0);
  await box(page).press('Enter');
  await expect(page.locator('.note__text')).toHaveText(['line one\nline two']);
});

test('empty or whitespace-only input saves nothing', async ({ page }) => {
  await startCharacter(page);
  await box(page).fill('   ');
  await box(page).press('Enter');
  await expect(page.locator('.note')).toHaveCount(0);
});

test('Esc clears the box', async ({ page }) => {
  await startCharacter(page);
  await box(page).fill('never mind');
  await box(page).press('Escape');
  await expect(box(page)).toHaveValue('');
});

test('notes appear oldest first and survive a reload', async ({ page }) => {
  await startCharacter(page);
  for (const t of ['first', 'second', 'third']) {
    await box(page).fill(t);
    await box(page).press('Enter');
    await expect(page.locator('.note__text').last()).toHaveText(t);
  }
  await page.reload();
  await expect(page.locator('.topbar__title')).toHaveText('Kael');
  await expect(page.locator('.note__text')).toHaveText(['first', 'second', 'third']);
});

test('fast double Enter does not duplicate a note', async ({ page }) => {
  await startCharacter(page);
  await box(page).fill('once');
  await box(page).press('Enter');
  await box(page).press('Enter');
  await expect(page.locator('.note__text')).toHaveText(['once']);
});

test('a note in another tab shows up here (live query across tabs)', async ({ page, context }) => {
  await startCharacter(page);
  const other = await context.newPage();
  await other.goto('/');
  await box(other).fill('from tab two');
  await box(other).press('Enter');
  await expect(page.locator('.note__text')).toHaveText(['from tab two']);
});
