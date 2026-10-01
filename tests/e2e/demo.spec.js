import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';

// demo/wren.kit (built by tests/tools/make-demo-kit.mjs) is the test
// character on the first-run screen. It must always unpack cleanly, and its
// as-typed notes must have linked the way the app links them.
test('Try the demo character: one tap from the first screen, everything in place', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo character' }).click();
  const dialog = page.getByRole('dialog', { name: 'Unpack kit' });
  await expect(dialog).toContainText('Unpack Wren Ashdown');
  await expect(dialog).toContainText('47 notes, 24 entities');
  await dialog.getByRole('button', { name: 'Unpack', exact: true }).click();

  const panel = (name) => page.getByRole('region', { name });
  const count = (label) => panel('People and places').getByRole('link', { name: new RegExp(label) });
  await expect(panel('My character')).toContainText('Exiled ranger looking for her missing sister');
  await expect(panel('My character').locator('.portrait')).toBeVisible();
  await expect(panel('Inbox')).toContainText('11 new notes');
  await expect(count('NPCs')).toHaveText('NPCs 8');
  await expect(count('Characters')).toHaveText('Characters 2');
  await expect(count('Stubs')).toHaveText('Stubs 3');
  await expect(panel('Recent files').locator('.thumb')).toHaveCount(4);

  // The deliberate rough edges are there to tidy.
  await count('Stubs').click();
  await expect(page.locator('.list__row')).toHaveText([/Grey Man/, /grimbolt/, /Hollow King/]);

  // Typed-as-you-would mentions linked properly: alias, possessive, two words.
  const linked = await page.evaluate(async () => {
    const d = window.__satchel.db;
    const ents = await d.entities.toArray();
    const id = (n) => ents.find((e) => e.name === n).id;
    const notes = await d.notes.toArray();
    const find = (s) => notes.find((n) => n.text.includes(s));
    return {
      alias: find('says vault under').mentions.includes(id('Grimbold Ironhand')),       // @Grim
      possessive: find('back. says she knew mum').mentions.includes(id('Mira Vane')),  // @Mira’s
      twoWords: find('job from').mentions.includes(id('Lord Aldric Thorne')),          // @Lord_Aldric_Thorne
    };
  });
  expect(linked).toEqual({ alias: true, possessive: true, twoWords: true });

  await page.goto('/#/character');
  await expect(page.getByLabel('Backstory')).toHaveValue(/Raised in the Thornwood/);
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue(/This is the Satchel test character/);
  await expect(page.getByRole('img', { name: /^Connections of Wren Ashdown/ }).locator('circle')).toHaveCount(9);

  await page.goto('/#/files');
  await page.locator('.thumb', { hasText: 'knives-letter.md' }).click();
  await expect(page.locator('.viewer__text')).toContainText('he did not burn it. idiot.');

  await page.goto('/#/');
  await enterSession(page);
  await expect(page.locator('.note__text').first()).toBeVisible();   // feed loads (no "No notes yet")
  await page.getByLabel('Note').pressSequentially('grim');
  await expect(page.getByRole('region', { name: 'Recall: Grimbold Ironhand' })).toBeVisible();
});

test('first names at the table: card, tap to link, and @FirstName all find the full entity', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the demo character' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Unpack', exact: true }).click();
  await enterSession(page);
  const box = page.getByLabel('Note');

  await box.pressSequentially('asked caldra about the ring');
  const card = page.getByRole('region', { name: 'Recall: Sister Caldra' });
  await expect(card).toBeVisible();
  await card.dispatchEvent('pointerdown');
  await expect(box).toHaveValue('asked @Sister_Caldra about the ring');
  await box.press('Enter');

  await box.pressSequentially('@grimbold says hi');
  await box.press('Enter');
  const result = await page.evaluate(async () => {
    const d = window.__satchel.db;
    const ents = await d.entities.toArray();
    const last = await d.notes.orderBy('created_at').last();
    return {
      linkedTo: ents.find((e) => e.id === last.mentions[0])?.name,
      newGrimboldStub: ents.some((e) => e.name.toLowerCase() === 'grimbold'),
    };
  });
  expect(result).toEqual({ linkedTo: 'Grimbold Ironhand', newGrimboldStub: false });
});
