import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';

const box = (page) => page.getByLabel('Note');

async function start(page) {
  await page.goto('/');
  await page.getByLabel('Character name').fill('Kael');
  await page.getByRole('button', { name: 'Start' }).click();
  await enterSession(page);
  await expect(box(page)).toBeFocused();
}

async function say(page, text) {
  await box(page).pressSequentially(text);
  await box(page).press('Enter');
  await expect(box(page)).toHaveValue('');
}

// Live (non-deleted) entities straight from IndexedDB via the localhost test hook.
const entities = (page) =>
  page.evaluate(async () => (await window.__satchel.db.entities.toArray()).filter((e) => !e.deleted));

const lastNote = (page) =>
  page.evaluate(async () => (await window.__satchel.db.notes.orderBy('created_at').last()));

test('unknown @name creates a stub and shows as a mention', async ({ page }) => {
  await start(page);
  await say(page, 'met @Grimbold at the forge');
  await expect(page.locator('.note .mention')).toHaveText(['Grimbold']);
  const ents = await entities(page);
  const stub = ents.find((e) => e.name === 'Grimbold');
  expect(stub.stub).toBe(true);
  expect(stub.type).toBe('unknown');
  const note = await lastNote(page);
  expect(note.mentions).toEqual([stub.id]);
  expect(note.text).toBe(`met @[Grimbold](${stub.id}) at the forge`);
});

test('second mention of the same name links, no duplicate stub', async ({ page }) => {
  await start(page);
  await say(page, '@Grimbold sells axes');
  await say(page, "@grimbold's prices are steep");
  const grims = (await entities(page)).filter((e) => e.name.toLowerCase() === 'grimbold');
  expect(grims).toHaveLength(1);
  await expect(page.locator('.note__text').last()).toHaveText("Grimbold's prices are steep");
});

test('multi-word name with underscores', async ({ page }) => {
  await start(page);
  await say(page, 'bowed to @Lord_Aldric.');
  expect((await entities(page)).some((e) => e.name === 'Lord Aldric')).toBe(true);
  await expect(page.locator('.note__text').last()).toHaveText('bowed to Lord Aldric.');
});

test('the player character can be mentioned', async ({ page }) => {
  await start(page);
  await say(page, '@Kael levelled up');
  const kaels = (await entities(page)).filter((e) => e.name === 'Kael');
  expect(kaels).toHaveLength(1);
  expect(kaels[0].type).toBe('character');
});

test('autocomplete: Tab picks the suggestion', async ({ page }) => {
  await start(page);
  await say(page, '@Lord_Aldric owns the mill');
  await box(page).pressSequentially('saw @ald');
  await expect(page.getByRole('option')).toHaveText([/Lord Aldric/]);
  await box(page).press('Tab');
  await expect(box(page)).toHaveValue('saw @Lord_Aldric ');
  await box(page).pressSequentially('again');
  await box(page).press('Enter');
  await expect(page.locator('.note__text').last()).toHaveText('saw Lord Aldric again');
  expect((await entities(page)).filter((e) => e.name === 'Lord Aldric')).toHaveLength(1);
});

test('autocomplete: tapping a suggestion picks it', async ({ page }) => {
  await start(page);
  await say(page, '@Mira is a fence');
  await box(page).pressSequentially('ask @mi');
  await page.getByRole('option', { name: /Mira/ }).dispatchEvent('pointerdown');
  await expect(box(page)).toHaveValue('ask @Mira ');
  await expect(box(page)).toBeFocused();
});

test('autocomplete: arrows move, Esc closes the list but keeps the text', async ({ page }) => {
  await start(page);
  await say(page, '@Grimbold and @Grista');
  await box(page).pressSequentially('@gri');
  await expect(page.getByRole('option')).toHaveCount(2);
  await box(page).press('ArrowDown');
  await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await box(page).press('Escape');
  await expect(page.getByRole('option')).toHaveCount(0);
  await expect(box(page)).toHaveValue('@gri');
});

test('new name shows a "new stub" hint; Enter still saves', async ({ page }) => {
  await start(page);
  await box(page).pressSequentially('@Zoltan');
  await expect(page.locator('.suggest__new')).toContainText('Zoltan');
  await box(page).press('Enter');
  await expect(page.locator('.note .mention')).toHaveText(['Zoltan']);
});

test('emails are not mentions', async ({ page }) => {
  await start(page);
  await say(page, 'write to kael@example.com');
  await expect(page.locator('.note .mention')).toHaveCount(0);
  expect((await entities(page)).map((e) => e.name)).toEqual(['Kael']);
});
