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
