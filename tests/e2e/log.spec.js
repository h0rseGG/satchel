import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';

const box = (page) => page.getByLabel('Note');

async function start(page) {
  await page.goto('/');
  await page.getByLabel('Character name').fill('Kael');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('region', { name: 'Inbox' })).toBeVisible();
}

async function note(page, text) {
  await box(page).pressSequentially(text);
  await box(page).press('Enter');
  await expect(box(page)).toHaveValue('');
}

const db = (page, fn) => page.evaluate(fn);
const lastNote = (page) => db(page, () => window.__satchel.db.notes.orderBy('created_at').last());

test('All notes: newest first, filter by text or mentioned name', async ({ page }) => {
  await start(page);
  await note(page, 'found the vault');
  await note(page, 'met @Grimbold');
  await page.getByRole('link', { name: 'All notes →' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('All notes');
  await expect(page.locator('.inbox__text')).toHaveText(['met Grimbold', 'found the vault']);
  await page.getByLabel('Filter notes').fill('grimb');
  await expect(page.locator('.inbox__text')).toHaveText(['met Grimbold']);
});

test('edit a note: typed form shown, links kept, original kept, "edited" shown', async ({ page }) => {
  await start(page);
  await note(page, 'bowed to @Lord_Aldric at the mil');
  await page.goto('/#/log');
  await page.getByRole('button', { name: 'Edit' }).click();
  const area = page.getByLabel('Edit note');
  await expect(area).toHaveValue('bowed to @Lord_Aldric at the mil');
  await area.fill('bowed to @Lord_Aldric at the mill, met @Mira');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('.inbox__text')).toHaveText(['bowed to Lord Aldric at the mill, met Mira']);
  await expect(page.locator('.inbox__meta')).toContainText('edited');
  const n = await lastNote(page);
  expect(n.original_text).toMatch(/at the mil$/);
  const ents = await db(page, async () => (await window.__satchel.db.entities.toArray()).map((e) => e.name).sort());
  expect(ents).toEqual(['Kael', 'Lord Aldric', 'Mira']);
  expect(n.mentions).toHaveLength(2);
});

test('editing keeps the link to a renamed entity', async ({ page }) => {
  await start(page);
  await note(page, 'met @Grim');
  const g = await db(page, async () => (await window.__satchel.db.entities.toArray()).find((e) => e.name === 'Grim'));
  await page.goto(`/#/entity/${g.id}`);
  await page.getByLabel('Name').fill('Grimbold Ironhand');
  await page.getByLabel('Name').blur();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grimbold Ironhand');
  await page.goto('/#/log');
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Edit note')).toHaveValue('met @Grimbold_Ironhand');
  await page.getByLabel('Edit note').fill('met @Grimbold_Ironhand twice');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.inbox__text')).toHaveText(['met Grimbold Ironhand twice']);
  expect((await lastNote(page)).mentions).toEqual([g.id]);
});

test('Esc cancels an edit; Ctrl+Enter saves', async ({ page }) => {
  await start(page);
  await note(page, 'one');
  await page.goto('/#/log');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Edit note').fill('changed');
  await page.getByLabel('Edit note').press('Escape');
  await expect(page.locator('.inbox__text')).toHaveText(['one']);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Edit note').fill('two');
  await page.getByLabel('Edit note').press('Control+Enter');
  await expect(page.locator('.inbox__text')).toHaveText(['two']);
});

test('delete a note: gone from the log, inbox and capture feed', async ({ page }) => {
  await start(page);
  await note(page, 'keep');
  await note(page, 'oops');
  await page.goto('/#/log');
  await page.locator('.inbox__note', { hasText: 'oops' }).getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.inbox__text')).toHaveText(['keep']);
  await page.goto('/#/');
  await expect(page.getByRole('region', { name: 'Inbox' })).toContainText('1 new note');
  await enterSession(page);
  await expect(page.locator('.note__text')).toHaveText(['keep']);
});

test('notes can be edited from the inbox too', async ({ page }) => {
  await start(page);
  await note(page, 'tpyo');
  await page.goto('/#/inbox');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Edit note').fill('typo');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.inbox__text')).toHaveText(['typo']);
  await expect(page.getByRole('button', { name: 'Keep as log' })).toBeVisible();
});
