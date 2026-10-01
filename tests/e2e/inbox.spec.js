import { test, expect } from '@playwright/test';
import { newCharacter, noSidewaysScroll } from './helpers.js';

const db = (page, fn, arg) => page.evaluate(fn, arg);
const note = (page, id) => db(page, (i) => window.__satchel.db.notes.get(i), id);

async function seed(page) {
  return db(page, async () => {
    const d = window.__satchel.data;
    const grim = await d.createEntity({ name: 'Grimbold Ironhand', type_id: 'type-npc', body: 'Forge by the mill.' });
    await d.setSession(true);
    const a = await d.addNote('first: paid @Grimbold back the 20gp #debts');
    await d.setSession(false);
    const b = await d.addNote('second: ask bess for disguises');
    const c = await d.addNote('third: @Grimbold owes @Mira a favour');
    return { grim: grim.id, a: a.id, b: b.id, c: c.id };
  });
}

test.beforeEach(async ({ page }) => {
  await newCharacter(page, 'Wren Ashdown');
});

test('Home shows the inbox count; Inbox lists unsorted notes oldest first', async ({ page }) => {
  await seed(page);
  await page.goto('/#/');
  await expect(page.locator('.home-count')).toContainText('3 new notes');
  await page.getByRole('link', { name: 'Sort them →' }).click();
  await expect(page.locator('.page-title')).toHaveText('Inbox');
  await expect(page.locator('.note-row-text')).toHaveText([/^first/, /^second/, /^third/]);
});

test('filter All / In / Out', async ({ page }) => {
  await seed(page);
  await page.goto('/#/inbox');
  await page.getByRole('button', { name: 'In session', exact: true }).click();
  await expect(page.locator('.note-row-text')).toHaveText([/^first/]);
  await page.getByRole('button', { name: 'Out of session' }).click();
  await expect(page.locator('.note-row-text')).toHaveText([/^second/, /^third/]);
});

test('Keep as log; Show sorted; Back to inbox', async ({ page }) => {
  const ids = await seed(page);
  await page.goto('/#/inbox');
  const row = page.locator(`[data-note="${ids.b}"]`);
  await row.getByRole('button', { name: 'Keep as log' }).click();
  await expect(page.locator('.note-row-text')).toHaveCount(2);
  expect((await note(page, ids.b)).triaged_at).not.toBeNull();
  await page.getByRole('button', { name: 'Show sorted' }).click();
  const sorted = page.getByRole('list', { name: 'Sorted' });
  await sorted.getByRole('button', { name: 'Back to inbox' }).click();
  await expect(page.getByRole('list', { name: 'Inbox' }).locator('.note-row-text')).toHaveCount(3);
});

test('Add to <mentioned entity>: appended to its description, dated; note sorted', async ({ page }) => {
  const ids = await seed(page);
  await page.goto('/#/inbox');
  await page.locator(`[data-note="${ids.a}"]`).getByRole('button', { name: 'Add to Grimbold Ironhand' }).click();
  await expect(page.getByText('Added to Grimbold Ironhand.')).toBeVisible();
  const g = await db(page, (i) => window.__satchel.db.entities.get(i), ids.grim);
  expect(g.body).toMatch(/^Forge by the mill\.\n\n\d{1,2} \w{3}: first: paid Grimbold back the 20gp #debts$/);
  const n = await note(page, ids.a);
  expect(n.promoted_to).toEqual([ids.grim]);
  expect(n.triaged_at).not.toBeNull();
});

test('Add to my character: choose a section', async ({ page }) => {
  const ids = await seed(page);
  await page.goto('/#/inbox');
  const row = page.locator(`[data-note="${ids.b}"]`);
  await row.getByRole('button', { name: 'Add to my character' }).click();
  const form = row.getByRole('form', { name: 'Add to my character' });
  await form.getByLabel('Section').selectOption('goals');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Added to Goals.')).toBeVisible();
  const pc = await db(page, async () => window.__satchel.db.entities.get((await window.__satchel.data.getMeta('bundle')).pc_entity_id));
  expect(pc.profile.goals).toMatch(/: second: ask bess for disguises$/);
  expect(pc.profile_times.goals).toBeTruthy();
});

test('Add as relationship: who, how, with whom; the note is its source', async ({ page }) => {
  const ids = await seed(page);
  await page.goto('/#/inbox');
  const row = page.locator(`[data-note="${ids.c}"]`);
  await row.getByRole('button', { name: 'Add as relationship' }).click();
  const form = row.getByRole('form', { name: 'Add as relationship' });
  await form.getByLabel('Who').selectOption({ label: 'Grimbold Ironhand' });
  await form.getByLabel('Relationship').selectOption('owes');
  const picker = form.getByRole('combobox', { name: 'With' });
  await picker.fill('mira');
  await picker.press('Enter');
  await expect(form.locator('.rel-preview')).toContainText('Grimbold Ironhand owes Mira');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Relationship added.')).toBeVisible();
  const rels = await db(page, () => window.__satchel.db.relationships.toArray());
  expect(rels).toHaveLength(1);
  expect([rels[0].from_id, rels[0].type, rels[0].directed, rels[0].source_note_ids]).toEqual([ids.grim, 'owes', true, [ids.c]]);
});

test('relationship in your own words', async ({ page }) => {
  const ids = await seed(page);
  await page.goto('/#/inbox');
  const row = page.locator(`[data-note="${ids.c}"]`);
  await row.getByRole('button', { name: 'Add as relationship' }).click();
  const form = row.getByRole('form', { name: 'Add as relationship' });
  await form.getByLabel('Relationship', { exact: true }).selectOption({ label: 'Other…' });
  await form.getByLabel('Relationship (your words)').fill('Sworn To');
  await form.getByRole('combobox', { name: 'With' }).fill('Mira');
  await form.getByRole('combobox', { name: 'With' }).press('Enter');
  await form.getByRole('button', { name: 'Save' }).click();
  const rels = await db(page, () => window.__satchel.db.relationships.toArray());
  expect([rels[0].type, rels[0].directed]).toEqual(['sworn to', true]);
});

test('Edit in place: same box and autocomplete; first version kept; Esc cancels', async ({ page }) => {
  const ids = await seed(page);
  await page.goto('/#/inbox');
  const row = page.locator(`[data-note="${ids.b}"]`);
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  const box = row.getByRole('combobox', { name: 'Edit note' });
  await expect(box).toHaveValue('second: ask bess for disguises');
  await expect(box).toBeFocused();
  await box.press('End');
  await box.pressSequentially(' from @gri');
  await box.press('Tab');
  await box.press('Enter');
  await expect(row.locator('.note-row-text')).toHaveText('second: ask bess for disguises from Grimbold Ironhand');
  const n = await note(page, ids.b);
  expect(n.original_text).toBe('second: ask bess for disguises');
  expect(n.mentions).toEqual([ids.grim]);
  await row.getByRole('button', { name: 'edited' }).click();
  await expect(row.locator('.note-original')).toContainText('First version: second: ask bess for disguises');
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await row.getByRole('combobox', { name: 'Edit note' }).press('Escape');
  await expect(row.getByRole('combobox', { name: 'Edit note' })).toHaveCount(0);
});

test('Delete is confirmed', async ({ page }) => {
  const ids = await seed(page);
  await page.goto('/#/inbox');
  await page.locator(`[data-note="${ids.b}"]`).getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('dialog', { name: 'Delete this note?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.note-row-text')).toHaveCount(2);
  expect((await note(page, ids.b)).deleted).toBe(true);
});

test('Mark all as log empties the inbox (for the current filter)', async ({ page }) => {
  await seed(page);
  await page.goto('/#/inbox');
  await page.getByRole('button', { name: 'Out of session' }).click();
  await page.getByRole('button', { name: 'Mark all as log' }).click();
  await expect(page.getByText('2 notes kept as log.')).toBeVisible();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('.note-row-text')).toHaveText([/^first/]);
  await page.getByRole('button', { name: 'Mark all as log' }).click();
  await expect(page.getByText('Nothing loose. Every page is filed.')).toBeVisible();
});

test('Notes: newest first; filter by tag (from a chip), mode, mentioned entity, text', async ({ page }) => {
  const ids = await seed(page);
  await page.goto('/#/notes');
  await expect(page.locator('.note-row-text')).toHaveText([/^third/, /^second/, /^first/]);
  await page.locator('.note-row-text a.tag', { hasText: '#debts' }).click();
  await expect(page).toHaveURL(/#\/notes\?tag=debts$/);
  await expect(page.locator('.note-row-text')).toHaveText([/^first/]);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByRole('button', { name: 'In session', exact: true }).click();
  await expect(page.locator('.note-row-text')).toHaveText([/^first/]);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.goto(`/#/notes?entity=${ids.grim}`);
  await expect(page.locator('.note-row-text')).toHaveText([/^third/, /^first/]);
  await page.goto('/#/notes');
  await page.getByPlaceholder('Search notes').fill('disgiuses');
  await expect(page.locator('.note-row-text')).toHaveText([/^second/]);
});

test('phone width: Inbox and Notes have no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await seed(page);
  for (const h of ['/#/inbox', '/#/notes']) {
    await page.goto(h);
    await expect(page.locator('.note-row').first()).toBeVisible();
    expect(await noSidewaysScroll(page), h).toBe(true);
  }
});
