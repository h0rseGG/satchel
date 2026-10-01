import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';

const box = (page) => page.getByLabel('Note');

async function start(page) {
  await page.goto('/');
  await page.getByLabel('Character name').fill('Kael');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('region', { name: 'Inbox' })).toBeVisible();
}

async function openCharacter(page) {
  await page.getByRole('region', { name: 'My character' }).getByRole('link', { name: 'My character' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kael');
}

test('fill in the character page; it autosaves and shows on the dashboard', async ({ page }) => {
  await start(page);
  await openCharacter(page);
  await page.getByLabel('Concept').fill('Exiled ranger hunting his brother’s killer');
  await page.getByLabel('Backstory').fill('Raised in the Thornwood.\nExiled after the fire.');
  await page.getByLabel('Flaws').fill('Trusts no one.');
  await page.getByLabel('Flaws').blur();
  await page.reload();
  await expect(page.getByLabel('Backstory')).toHaveValue('Raised in the Thornwood.\nExiled after the fire.');
  await expect(page.getByLabel('Flaws')).toHaveValue('Trusts no one.');
  await page.getByRole('link', { name: '← Dashboard' }).click();
  await expect(page.getByRole('region', { name: 'My character' })).toContainText('Exiled ranger hunting');
});

test('sections typed quickly one after another all keep their text', async ({ page }) => {
  await start(page);
  await openCharacter(page);
  // Each field saves on its own timer; none may overwrite another.
  for (const [label, text] of [['Personality', 'Quiet'], ['Ideals', 'Freedom'], ['Bonds', 'Sister'], ['Goals', 'Revenge']]) {
    await page.getByLabel(label).fill(text);
  }
  await page.getByLabel('Goals').blur();
  await expect.poll(async () => page.evaluate(async () => {
    const id = (await window.__satchel.db.meta.get('pc_entity_id')).value;
    const p = (await window.__satchel.db.entities.get(id)).profile ?? {};
    return [p.personality, p.ideals, p.bonds, p.goals];
  })).toEqual(['Quiet', 'Freedom', 'Sister', 'Revenge']);
});

test('renaming the character updates the top bar', async ({ page }) => {
  await start(page);
  await openCharacter(page);
  await page.getByLabel('Name', { exact: true }).fill('Kael Stormborn');
  await page.getByLabel('Name', { exact: true }).blur();
  await expect(page.locator('.topbar__title')).toHaveText('Kael Stormborn');
});

test('in session: tap the name for a read-only overview; note text survives', async ({ page }) => {
  await start(page);
  await openCharacter(page);
  await page.getByLabel('Concept').fill('Exiled ranger');
  await page.getByLabel('Ideals').fill('Freedom above all');
  await page.getByLabel('Ideals').blur();
  await page.goto('/#/');
  await enterSession(page);
  await box(page).pressSequentially('half a thought');

  await page.getByRole('button', { name: 'Kael' }).click();
  const ov = page.getByRole('dialog', { name: 'Kael overview' });
  await expect(ov).toContainText('Exiled ranger');
  await expect(ov.locator('h3')).toHaveText(['Ideals']);  // only filled sections
  await expect(ov.getByRole('textbox')).toHaveCount(0);   // read-only
  await ov.getByRole('button', { name: 'Close' }).click();
  await expect(ov).toHaveCount(0);
  await expect(box(page)).toHaveValue('half a thought');
  await expect(box(page)).toBeFocused();
});

test('overview with nothing written says so', async ({ page }) => {
  await start(page);
  await enterSession(page);
  await page.getByRole('button', { name: 'Kael' }).click();
  await expect(page.getByRole('dialog')).toContainText('Nothing written yet');
});
