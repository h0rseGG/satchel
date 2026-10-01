import { test, expect } from '@playwright/test';

const box = (page) => page.getByLabel('Note');
const card = (page, name) => page.getByRole('region', { name: `Recall: ${name}` });

async function start(page) {
  await page.goto('/');
  await page.getByLabel('Character name').fill('Kael');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(box(page)).toBeFocused();
}

async function say(page, text) {
  await box(page).pressSequentially(text);
  await box(page).press('Enter');
  await expect(box(page)).toHaveValue('');
}

test('typing a known name shows its recall card with the last 3 mentions', async ({ page }) => {
  await start(page);
  for (const t of ['@Grimbold one', '@Grimbold two', '@Grimbold three', '@Grimbold four']) await say(page, t);
  await box(page).pressSequentially('grimbold');
  const c = card(page, 'Grimbold');
  await expect(c).toBeVisible();
  await expect(c.locator('.card__count')).toHaveText('4 mentions');
  await expect(c.locator('.card__text')).toHaveText(['Grimbold four', 'Grimbold three', 'Grimbold two']);
  await expect(c.locator('.card__summary')).toContainText('First mention: Grimbold one');
});

test('highlighted @suggestion shows its card while typing', async ({ page }) => {
  await start(page);
  await say(page, '@Lord_Aldric owns the mill');
  await box(page).pressSequentially('talked to @ald');
  await expect(card(page, 'Lord Aldric')).toBeVisible();
  await expect(card(page, 'Lord Aldric').locator('.card__summary')).toHaveText('No summary yet.');
});

test('player character gets no recall card', async ({ page }) => {
  await start(page);
  await say(page, '@Kael levelled up');
  await box(page).pressSequentially('kael');
  await expect(page.locator('.card')).toHaveCount(0);
});

test('short text searches notes, with typo tolerance', async ({ page }) => {
  await start(page);
  await say(page, 'found a hidden vault under the mill');
  await say(page, 'bought rope');
  await box(page).pressSequentially('vualt');
  await expect(page.locator('.hit')).toHaveCount(1);
  await expect(page.locator('.hit')).toContainText('hidden vault under the mill');
});

test('no matches says so; Enter still saves', async ({ page }) => {
  await start(page);
  await box(page).pressSequentially('zzqx');
  await expect(page.getByText('No matches. Enter saves this as a note.')).toBeVisible();
  await box(page).press('Enter');
  await expect(page.locator('.note__text')).toHaveText(['zzqx']);
});

test('long text without names keeps the feed visible', async ({ page }) => {
  await start(page);
  await say(page, 'first note');
  await box(page).pressSequentially('we walked for three days through rain');
  await expect(page.locator('.note__text')).toHaveText(['first note']);
});

test('long text containing a name shows its card', async ({ page }) => {
  await start(page);
  await say(page, '@Mira is a fence');
  await box(page).pressSequentially('we walked for days and then Mira showed up');
  await expect(card(page, 'Mira')).toBeVisible();
});

test('short screen: card sits just above the box and is in view', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 420 }); // roughly a Pixel with the keyboard up
  await start(page);
  for (const t of ['@Grimbold one', '@Grimbold two', '@Grimbold three', 'grimbold note', 'grimbold again']) {
    await say(page, t);
  }
  await box(page).pressSequentially('grimbold');
  const c = card(page, 'Grimbold');
  await expect(c).toBeInViewport();
  const cardBox = await c.boundingBox();
  const footer = await page.locator('.capture').boundingBox();
  expect(footer.y - (cardBox.y + cardBox.height)).toBeLessThan(30);
  await expect(page.locator('.topbar')).toBeInViewport();
});

test('tap a card to link a name typed without @', async ({ page }) => {
  await start(page);
  await say(page, 'found the @Sunblade in a crypt');
  await box(page).pressSequentially('the sunblade glows');
  const c = card(page, 'Sunblade');
  await expect(c.locator('.card__link')).toHaveText('Tap to link');
  await c.dispatchEvent('pointerdown');
  await expect(box(page)).toHaveValue('the @Sunblade glows');
  await expect(box(page)).toBeFocused();
  await expect(c.locator('.card__link')).toHaveText('Linked');
  await box(page).press('Enter');
  await expect(page.locator('.note .mention')).toHaveText(['Sunblade', 'Sunblade']);
  const blades = await page.evaluate(async () =>
    (await window.__satchel.db.entities.toArray()).filter((e) => e.name === 'Sunblade'));
  expect(blades).toHaveLength(1);
});

test('linking a name at the end adds a space and keeps typing smooth', async ({ page }) => {
  await start(page);
  await say(page, '@Lord_Aldric owns the mill');
  await box(page).pressSequentially('bowed to lord aldric');
  await card(page, 'Lord Aldric').dispatchEvent('pointerdown');
  await expect(box(page)).toHaveValue('bowed to @Lord_Aldric ');
  await expect(page.getByRole('option')).toHaveCount(0);
  await box(page).pressSequentially('today');
  await expect(box(page)).toHaveValue('bowed to @Lord_Aldric today');
});

test('quick type on a stub card: keyboard stays in the box, card does not link', async ({ page }) => {
  await start(page);
  await say(page, 'met @Grimbold');
  await box(page).pressSequentially('grimbold sells axes');
  const c = card(page, 'Grimbold');
  await c.getByRole('button', { name: 'stub ▾' }).dispatchEvent('pointerdown');
  const types = c.getByRole('group', { name: 'Set type of Grimbold' });
  await expect(types.getByRole('button')).toHaveText(['npc', 'location', 'item', 'faction', 'character', 'other']);
  await types.getByRole('button', { name: 'npc' }).dispatchEvent('pointerdown');

  await expect(c.locator('.card__head')).toContainText('npc');
  await expect(c.getByRole('button', { name: 'stub ▾' })).toHaveCount(0);
  await expect(box(page)).toHaveValue('grimbold sells axes');
  await expect(box(page)).toBeFocused();
  const g = await page.evaluate(async () =>
    (await window.__satchel.db.entities.toArray()).find((e) => e.name === 'Grimbold'));
  expect([g.type, g.stub]).toEqual(['npc', false]);
});

test('typed entities show their type, not the picker', async ({ page }) => {
  await start(page);
  await say(page, 'met @Mira');
  await page.evaluate(async () => {
    const d = window.__satchel.db;
    const m = (await d.entities.toArray()).find((e) => e.name === 'Mira');
    await d.entities.put({ ...m, type: 'npc', stub: false, tags: ['fence', 'owes us'] });
  });
  await box(page).pressSequentially('mira');
  const c = card(page, 'Mira');
  await expect(c.getByRole('button', { name: 'stub ▾' })).toHaveCount(0);
  await expect(c.locator('.card__head')).toContainText('npc');
  await expect(c.locator('.card__tags')).toHaveText('fence, owes us');
});

test('search finds an entity by tag', async ({ page }) => {
  await start(page);
  await say(page, 'met @Bree');
  await page.evaluate(async () => {
    const d = window.__satchel.db;
    const b = (await d.entities.toArray()).find((e) => e.name === 'Bree');
    await d.entities.put({ ...b, tags: ['shopkeeper'] });
  });
  await box(page).pressSequentially('shopkeeper');
  await expect(page.locator('.hit').first()).toContainText('Bree');
});

test('build label is shown', async ({ page }) => {
  await start(page);
  await expect(page.locator('.topbar__build')).toHaveText(/^\d{4}-\d{2}-\d{2}\.\d+$/);
});

test('clearing the box returns to the feed', async ({ page }) => {
  await start(page);
  await say(page, '@Mira is a fence');
  await box(page).pressSequentially('mira');
  await expect(card(page, 'Mira')).toBeVisible();
  await box(page).press('Escape');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('.note__text')).toHaveText(['Mira is a fence']);
});
