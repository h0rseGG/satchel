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

const notesInList = (page) => page.locator('.inbox__note .inbox__text');
const entityByName = (page, name) => page.evaluate(async (n) =>
  (await window.__satchel.db.entities.toArray()).find((e) => e.name === n && !e.deleted), name);

test('inbox lists new notes oldest first; Keep as log removes one', async ({ page }) => {
  await start(page);
  await note(page, 'first');
  await note(page, 'second');
  await page.getByRole('link', { name: 'Sort them →' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox');
  await expect(notesInList(page)).toHaveText(['first', 'second']);
  await page.locator('.inbox__note').first().getByRole('button', { name: 'Keep as log' }).click();
  await expect(notesInList(page)).toHaveText(['second']);
  await page.goto('/#/');
  await expect(page.getByRole('region', { name: 'Inbox' })).toContainText('1 new note');
});

test('add a note to a mentioned entity’s description, with its date', async ({ page }) => {
  await start(page);
  await note(page, '@Grimbold owes us 20 gp');
  await page.goto('/#/inbox');
  await page.getByRole('button', { name: 'Add to Grimbold' }).click();
  await expect(page.getByRole('status')).toContainText('Added to Grimbold’s description');
  await expect(notesInList(page)).toHaveCount(0);
  const g = await entityByName(page, 'Grimbold');
  expect(g.body).toMatch(/^\w{3}, \d{1,2} \w{3} \d{4}: Grimbold owes us 20 gp$/);

  await page.goto('/#/');
  await note(page, '@Grimbold has a forge');
  await page.goto('/#/inbox');
  await page.getByRole('button', { name: 'Add to Grimbold' }).click();
  await expect(notesInList(page)).toHaveCount(0);
  const g2 = await entityByName(page, 'Grimbold');
  expect(g2.body.split('\n\n')).toHaveLength(2);
  const n = await page.evaluate(() => window.__satchel.db.notes.orderBy('created_at').last());
  expect(n.promoted_to).toEqual([g.id]);
});

test('add a note to a section of my character', async ({ page }) => {
  await start(page);
  await note(page, 'I swore to find my brother');
  await page.goto('/#/inbox');
  await page.getByLabel('Add to my character').selectOption('goals');
  await expect(page.getByRole('status')).toContainText('Added to your goals');
  await page.goto('/#/character');
  await expect(page.getByLabel('Goals')).toHaveValue(/: I swore to find my brother$/);
});

test('the player character is not offered as an "Add to" button', async ({ page }) => {
  await start(page);
  await note(page, '@Kael met @Mira');
  await page.goto('/#/inbox');
  await expect(page.locator('.inbox__note').getByRole('button', { name: /^Add to/ })).toHaveText(['Add to Mira']);
});

test('filter by mode; Mark all as log respects the filter', async ({ page }) => {
  await start(page);
  await note(page, 'out one');
  await enterSession(page);
  await note(page, 'in one');
  await note(page, 'in two');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();

  await page.goto('/#/inbox');
  await expect(notesInList(page)).toHaveText(['out one', 'in one', 'in two']);
  await page.getByRole('button', { name: 'In session', exact: true }).click();
  await expect(notesInList(page)).toHaveText(['in one', 'in two']);
  await page.getByRole('button', { name: 'Mark all as log' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mark all' }).click();
  await expect(page.getByRole('status')).toContainText('2 notes kept as log');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(notesInList(page)).toHaveText(['out one']);
});

test('sorted notes can go back to the inbox', async ({ page }) => {
  await start(page);
  await note(page, 'oops');
  await page.goto('/#/inbox');
  await page.getByRole('button', { name: 'Keep as log' }).click();
  await expect(page.getByText('All sorted')).toBeVisible();
  await page.getByRole('button', { name: 'Show sorted' }).click();
  await expect(notesInList(page)).toHaveText(['oops']);
  await page.getByRole('button', { name: 'Back to inbox' }).click();
  await page.getByRole('button', { name: 'Show new' }).click();
  await expect(notesInList(page)).toHaveText(['oops']);
});

test('inbox mentions link to entity pages', async ({ page }) => {
  await start(page);
  await note(page, 'met @Grimbold');
  await page.goto('/#/inbox');
  await page.locator('.inbox__text').getByRole('link', { name: 'Grimbold' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grimbold');
});
