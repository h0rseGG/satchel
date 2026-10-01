import { test, expect } from '@playwright/test';
import { newCharacter, noSidewaysScroll } from './helpers.js';

// Every capture spec runs at desktop and phone width (M3 "done when").
const WIDTHS = [['desktop', { width: 1280, height: 800 }], ['phone', { width: 412, height: 860 }]];

async function seed(page) {
  return page.evaluate(async () => {
    const d = window.__satchel.data;
    const mk = (name, extra = {}) => d.createEntity({ name, type_id: 'type-npc', ...extra });
    const grim = await mk('Grimbold Ironhand', { summary: 'Dwarf smith. 10% a week.' });
    const ald = await mk('Lord Aldric');
    const mira = await mk('Mira Vane', { aliases: ['The Fox'] });
    await d.addNote('old note about brimstone at the mill #clue');
    await d.addNote('more #clue stuff');
    await d.addNote('a #debts note');
    return { grim: grim.id, ald: ald.id, mira: mira.id };
  });
}

async function startSession(page) {
  await page.locator('.session-btn').click();
  await expect(page.locator('.session-btn')).toHaveText('In session', { useInnerText: true });
  const box = page.getByRole('combobox', { name: 'Note' });
  await expect(box).toBeFocused();
  return box;
}

// Waits for the saved note itself, not for the key press (v1 lesson 7).
const findNote = (page, fragment) => page.evaluate(async (f) => (await window.__satchel.db.notes.toArray()).find((n) => n.text.includes(f)) ?? null, fragment);
async function savedNote(page, fragment) {
  await expect.poll(() => findNote(page, fragment)).not.toBeNull();
  return findNote(page, fragment);
}

for (const [label, viewport] of WIDTHS) {
  test.describe(label, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await newCharacter(page, 'Wren Ashdown');
    });

    test('Enter saves to the feed in session mode; box clears and keeps focus; every address shows capture', async ({ page }) => {
      await page.goto('/#/world');
      const box = await startSession(page);
      await expect(page.locator('.topbar-crumbs')).toHaveText('');
      await box.fill('rainy af in millbrook');
      await box.press('Enter');
      await expect(page.locator('.feed-item')).toHaveText([/rainy af in millbrook/]);
      await expect(box).toHaveValue('');
      await expect(box).toBeFocused();
      expect((await savedNote(page, 'rainy af')).mode).toBe('in');
      await page.goto('/#/settings');
      await expect(page.locator('.feed-item')).toHaveCount(1);
      expect(await noSidewaysScroll(page)).toBe(true);
    });

    test('typing straight after Enter starts a new note, not the end of the last one', async ({ page }) => {
      const box = await startSession(page);
      await box.pressSequentially('first note');
      await box.press('Enter');
      await box.pressSequentially('second');
      await expect(box).toHaveValue('second');
      expect((await savedNote(page, 'first note')).text).toBe('first note');
    });

    test('@ autocomplete: Tab picks, the pick is what gets saved', async ({ page }) => {
      const ids = await seed(page);
      const box = await startSession(page);
      await box.pressSequentially('paid @gri');
      const list = page.getByRole('listbox', { name: 'Suggestions' });
      await expect(list.getByRole('option')).toHaveText([/Grimbold Ironhand/]);
      await box.press('Tab');
      await expect(box).toHaveValue('paid @Grimbold_Ironhand ');
      await box.pressSequentially('back');
      await box.press('Enter');
      const n = await savedNote(page, ') back');
      expect(n.mentions).toEqual([ids.grim]);
      await expect(page.locator('.feed-item .mention')).toHaveText('Grimbold Ironhand');
    });

    test('tap picks on pointerdown and keeps focus; typing right after lands in the right place', async ({ page }) => {
      await seed(page);
      const box = await startSession(page);
      await box.pressSequentially('saw @mir');
      await page.getByRole('option', { name: /Mira Vane/ }).dispatchEvent('pointerdown', { button: 0 });
      await box.pressSequentially('today');
      await expect(box).toHaveValue('saw @Mira_Vane today');
      await expect(box).toBeFocused();
    });

    test('Enter always saves, even with the list open; new names become stubs (with a hint first)', async ({ page }) => {
      await seed(page);
      const box = await startSession(page);
      await box.pressSequentially('met @Pip');
      await expect(page.locator('.suggest-hint')).toHaveText('New stub: Pip');
      await box.press('Enter');
      const n = await savedNote(page, 'met @[Pip]');
      const pip = await page.evaluate((id) => window.__satchel.db.entities.get(id), n.mentions[0]);
      expect([pip.name, pip.stub, pip.type_id]).toEqual(['Pip', true, null]);
    });

    test('arrows move the highlight (list reads bottom-up); Esc closes it, a second Esc clears the box', async ({ page }) => {
      await page.evaluate(async () => {
        const d = window.__satchel.data;
        await d.createEntity({ name: 'Bess', type_id: 'type-npc', updated_at: '2026-09-01T00:00:00.000Z' });
        await d.createEntity({ name: 'Bertram', type_id: 'type-npc' });
      });
      const box = await startSession(page);
      await box.pressSequentially('@be');
      const active = page.locator('.suggest-item.is-active');
      const first = await active.textContent();
      await box.press('ArrowUp');
      expect(await active.textContent()).not.toBe(first);
      await box.press('ArrowDown');
      expect(await active.textContent()).toBe(first);
      await box.press('Escape');
      await expect(page.locator('.suggest')).toHaveCount(0);
      await expect(box).toHaveValue('@be');
      await box.press('Escape');
      await expect(box).toHaveValue('');
    });

    test('# suggests tags, most used first; Tab picks', async ({ page }) => {
      await seed(page);
      const box = await startSession(page);
      await box.pressSequentially('found it #');
      await expect(page.getByRole('option')).toHaveText([/#clue/, /#debts/]);
      await box.press('Tab');
      await expect(box).toHaveValue('found it #clue ');
    });

    test('recall: a plain short name brings up the card; never for the player character', async ({ page }) => {
      await seed(page);
      const box = await startSession(page);
      await box.pressSequentially('wren and grimbold');
      const card = page.locator('.recall-card');
      await expect(card).toHaveCount(1);
      await expect(card.locator('.card-title')).toHaveText('Grimbold Ironhand');
      await expect(card).toContainText('NPC');
      await expect(card).toContainText('Dwarf smith. 10% a week.');
      await expect(card).toContainText('0 mentions');
    });

    test('recall card for the highlighted @suggestion', async ({ page }) => {
      await seed(page);
      const box = await startSession(page);
      await box.pressSequentially('@the_f');
      await expect(page.locator('.recall-card .card-title')).toHaveText('Mira Vane');
    });

    test('tap to link: "lord aldric" beats the short name inside it, and saves as that entity', async ({ page }) => {
      const ids = await seed(page);
      const box = await startSession(page);
      await box.pressSequentially('aldric lied, then lord aldric left');
      await page.getByRole('button', { name: 'Turn “Lord Aldric” into a mention' }).dispatchEvent('pointerdown', { button: 0 });
      await expect(box).toHaveValue('aldric lied, then @lord_aldric left');
      await expect(box).toBeFocused();
      await box.press('Enter');
      expect((await savedNote(page, ') left')).mentions).toEqual([ids.ald]);
    });

    test('quick type: the stub picker sets a type in one tap', async ({ page }) => {
      await seed(page);
      const box = await startSession(page);
      await box.pressSequentially('met @Pip');
      await box.press('Enter');
      await box.pressSequentially('pip again');
      const card = page.locator('.recall-card', { hasText: 'Pip' });
      await card.getByRole('button', { name: 'Set a type for Pip' }).dispatchEvent('pointerdown', { button: 0 });
      await card.getByRole('button', { name: 'NPC' }).dispatchEvent('pointerdown', { button: 0 });
      await expect(card.locator('.card-sub')).toHaveText('NPC');
      await expect(box).toBeFocused();
      await expect(box).toHaveValue('pip again');
    });

    test('card shows "First mention" after 3+ mentions (no summary) and the last 3, dated', async ({ page }) => {
      await seed(page);
      const box = await startSession(page);
      for (const t of ['1 @Lord_Aldric', '2 @Lord_Aldric', '3 @Lord_Aldric', '4 @Lord_Aldric']) {
        await box.fill(t);
        await box.press('Enter');
        await expect(box).toHaveValue('');
      }
      await box.pressSequentially('lord aldric');
      const card = page.locator('.recall-card');
      await expect(card).toContainText('4 mentions');
      await expect(card).toContainText('First mention: 1 Lord Aldric');
      await expect(card.locator('.recall-mentions li')).toHaveCount(3);
      await expect(card.locator('.recall-mentions li').first()).toContainText('4 Lord Aldric');
    });

    test('search runs alongside short text, typo-tolerant', async ({ page }) => {
      await seed(page);
      const box = await startSession(page);
      await box.pressSequentially('brimstoen');
      await expect(page.locator('.recall-hit')).toContainText(['old note about brimstone at the mill']);
    });

    test('character overview: tap your name; closing returns focus to the box', async ({ page }) => {
      await page.evaluate(async () => {
        const d = window.__satchel.data;
        const { pc_entity_id } = await d.getMeta('bundle');
        await d.updateEntity(pc_entity_id, { profile: { concept: 'Exiled ranger looking for her sister' }, dndbeyond_url: 'https://www.dndbeyond.com/characters/1' });
      });
      await startSession(page);
      await page.locator('.topbar-home').click();
      await expect(page.getByRole('heading', { name: 'Wren Ashdown' })).toBeVisible();
      await expect(page.getByText('Exiled ranger looking for her sister')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open in D&D Beyond' })).toHaveAttribute('target', '_blank');
      await page.getByRole('button', { name: 'Back to notes' }).click();
      await expect(page.getByRole('combobox', { name: 'Note' })).toBeFocused();
    });

    test('auto-end after 12 hours with nothing written', async ({ page }) => {
      // The live app picks this up and checks at once (the same check runs on open).
      await page.evaluate(() => window.__satchel.data.setMeta('session', { mode: 'in', mode_since: new Date(Date.now() - 13 * 3600e3).toISOString() }));
      await expect(page.getByText('Session ended: nothing written for 12 hours.')).toBeVisible();
      await expect(page.locator('.session-btn')).toHaveAttribute('aria-pressed', 'false');
    });

    test('out of session: the Home quick note goes to Recent notes as an out note', async ({ page }) => {
      const box = page.getByRole('combobox', { name: 'Note' });
      await box.fill('ask @Bess for disguises');
      await box.press('Enter');
      await expect(page.locator('.list-row').first()).toContainText('ask Bess for disguises');
      expect((await savedNote(page, 'disguises')).mode).toBe('out');
      expect(await noSidewaysScroll(page)).toBe(true);
    });
  });
}
