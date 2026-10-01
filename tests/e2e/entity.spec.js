import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';

const box = (page) => page.getByLabel('Note');

async function start(page) {
  await page.goto('/');
  await page.getByLabel('Character name').fill('Kael');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('region', { name: 'Inbox' })).toBeVisible();
}

async function quickNote(page, text) {
  await box(page).pressSequentially(text);
  await box(page).press('Enter');
  await expect(box(page)).toHaveValue('');
}

const entityByName = (page, name) => page.evaluate(async (n) =>
  (await window.__satchel.db.entities.toArray()).find((e) => e.name === n && !e.deleted), name);

async function openEntity(page, name) {
  const e = await entityByName(page, name);
  await page.goto(`/#/entity/${e.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
}

test('dashboard → stubs list → entity page; back button returns', async ({ page }) => {
  await start(page);
  await quickNote(page, 'met @Grimbold and @Mira');
  await page.getByRole('link', { name: /Stubs/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stubs');
  await expect(page.locator('.list__row')).toHaveText([/Grimbold/, /Mira/]);
  await page.getByRole('link', { name: /Grimbold/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grimbold');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stubs');
  await page.goBack();
  await expect(page.getByRole('region', { name: 'Inbox' })).toBeVisible();
});

test('edit fields: autosave survives reload; summary appears on the recall card', async ({ page }) => {
  await start(page);
  await quickNote(page, 'met @Grimbold');
  await openEntity(page, 'Grimbold');
  await page.getByLabel('Type', { exact: true }).selectOption('npc');
  await page.getByLabel('Summary').fill('dwarf smith in Brindol');
  await page.getByLabel('Description').fill('Owes us 20 gp.\nHas a forge.');
  await page.getByLabel('Description').blur();
  await page.getByLabel('Tags').fill('dwarf, smith');
  await page.getByLabel('Tags').press('Enter');
  await page.getByLabel('Also known as').fill('Grim');
  await page.getByLabel('Also known as').press('Enter');
  await expect(page.locator('.chip')).toHaveText([/dwarf/, /smith/, /Grim/]);

  await page.reload();
  await expect(page.getByLabel('Summary')).toHaveValue('dwarf smith in Brindol');
  await expect(page.getByLabel('Description')).toHaveValue('Owes us 20 gp.\nHas a forge.');
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('npc');
  const g = await entityByName(page, 'Grimbold');
  expect([g.type, g.stub, g.tags, g.aliases]).toEqual(['npc', false, ['dwarf', 'smith'], ['Grim']]);

  await page.goto('/#/');
  await enterSession(page);
  await box(page).pressSequentially('grimbold');
  await expect(page.locator('.card__summary')).toHaveText('dwarf smith in Brindol');
  await expect(page.locator('.card__tags')).toHaveText('dwarf, smith');
});

test('an alias links new notes to the entity', async ({ page }) => {
  await start(page);
  await quickNote(page, 'met @Grimbold');
  await openEntity(page, 'Grimbold');
  await page.getByLabel('Also known as').fill('Grim');
  await page.getByLabel('Also known as').press('Enter');
  await expect(page.locator('.chip')).toHaveText([/Grim/]);
  await page.goto('/#/');
  await quickNote(page, 'paid @Grim');
  const g = await entityByName(page, 'Grimbold');
  const last = await page.evaluate(() => window.__satchel.db.notes.orderBy('created_at').last());
  expect(last.mentions).toEqual([g.id]);
});

test('rename: old notes show the new name; empty name is refused', async ({ page }) => {
  await start(page);
  await quickNote(page, 'met @Grimbold');
  await openEntity(page, 'Grimbold');
  await page.getByLabel('Name').fill('Grimbold Ironhand');
  await page.getByLabel('Name').blur();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grimbold Ironhand');
  await expect(page.locator('.entity__notes .mention')).toHaveText('Grimbold Ironhand');

  await page.getByLabel('Name').fill('   ');
  await page.getByLabel('Name').blur();
  await expect(page.getByRole('alert')).toContainText('can’t be empty');
  await expect(page.getByLabel('Name')).toHaveValue('Grimbold Ironhand');
});

test('changing a stub to a type moves it to that list', async ({ page }) => {
  await start(page);
  await quickNote(page, 'visited @Brindol');
  await openEntity(page, 'Brindol');
  await page.getByLabel('Type', { exact: true }).selectOption('location');
  await page.goto('/#/');
  await expect(page.getByRole('link', { name: /Locations/ })).toHaveText('Locations 1');
  await expect(page.getByRole('link', { name: /Stubs/ })).toHaveText('Stubs 0');
});

test('new entity from a list page', async ({ page }) => {
  await start(page);
  await page.goto('/#/list/item');
  await page.getByLabel('New item name').fill('Sunblade');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sunblade');
  await expect(page.getByLabel('Type', { exact: true })).toHaveValue('item');
  await page.goBack();
  await expect(page.locator('.list__row')).toHaveText([/Sunblade/]);
});

test('list filter matches names, aliases and tags', async ({ page }) => {
  await start(page);
  await quickNote(page, '@Bree @Grimbold @Mira');
  await openEntity(page, 'Bree');
  await page.getByLabel('Tags').fill('shopkeeper');
  await page.getByLabel('Tags').press('Enter');
  await expect(page.locator('.chip')).toHaveText([/shopkeeper/]);
  await page.goto('/#/list/stub');
  await page.getByLabel('Filter').fill('shop');
  await expect(page.locator('.list__row')).toHaveText([/Bree/]);
  await page.getByLabel('Filter').fill('mi');
  await expect(page.locator('.list__row')).toHaveText([/Mira/]);
});

test('merge a typo stub into the real entity', async ({ page }) => {
  await start(page);
  await quickNote(page, 'met @Grimbold');
  await quickNote(page, 'paid @Grimbolt');
  await openEntity(page, 'Grimbolt');
  await page.getByRole('button', { name: 'Merge into…' }).click();
  await page.getByLabel('Find entity').fill('grimbold');
  await page.getByRole('button', { name: /Grimbold/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Merge' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grimbold');
  await expect(page.getByRole('status')).toContainText('Merged Grimbolt into Grimbold');
  await expect(page.locator('.chip')).toHaveText([/Grimbolt/]);
  await expect(page.locator('.entity__notes li')).toHaveCount(2);
  await expect(page.locator('.entity__notes .mention')).toHaveText(['Grimbold', 'Grimbold']);
  expect(await entityByName(page, 'Grimbolt')).toBeUndefined();
});

test('delete: entity leaves its list; notes keep the name as text', async ({ page }) => {
  await start(page);
  await quickNote(page, 'met @Zoltan');
  await openEntity(page, 'Zoltan');
  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stubs');
  await expect(page.locator('.list__row')).toHaveCount(0);
  await enterSession(page);
  await expect(page.locator('.note .mention')).toHaveText(['Zoltan']);
});

test('your own character opens the character page instead', async ({ page }) => {
  await start(page);
  const kael = await entityByName(page, 'Kael');
  await page.goto(`/#/entity/${kael.id}`);
  await expect(page.getByRole('link', { name: 'Open the character page' })).toBeVisible();
});

test('entity page on a phone-width screen has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 800 });
  await start(page);
  await quickNote(page, 'met @Grimbold');
  await openEntity(page, 'Grimbold');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412);
});
