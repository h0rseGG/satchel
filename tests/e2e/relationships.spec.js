import { test, expect } from '@playwright/test';
import { newCharacter, noSidewaysScroll } from './helpers.js';

const mk = (page, name, extra = {}) => page.evaluate(([n, x]) => window.__satchel.data.createEntity({ name: n, type_id: 'type-npc', ...x }), [name, extra]);
const rels = (page) => page.evaluate(() => window.__satchel.db.relationships.toArray());

test.beforeEach(async ({ page }) => {
  await newCharacter(page, 'Wren Ashdown');
});

async function add(page, { type, other, withName, swap = false }) {
  await page.getByRole('button', { name: 'Add relationship' }).click();
  const form = page.getByRole('form', { name: 'Add relationship' });
  if (other) {
    await form.getByLabel('Relationship', { exact: true }).selectOption({ label: 'Other…' });
    await form.getByLabel('Relationship (your words)').fill(other);
  } else {
    await form.getByLabel('Relationship', { exact: true }).selectOption(type);
  }
  await form.getByRole('combobox', { name: 'With' }).fill(withName);
  await form.getByRole('combobox', { name: 'With' }).press('Enter');
  if (swap) await form.getByRole('button', { name: 'Swap direction' }).click();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
}

test('both-ways relationship reads as a sentence on both pages; names link', async ({ page }) => {
  const ald = await mk(page, 'Lord Aldric Thorne');
  const grim = await mk(page, 'Grimbold Ironhand');
  await page.goto(`/#/entity/${ald.id}`);
  await add(page, { type: 'rival', withName: 'grimbold' });
  const row = page.locator('.rel-row .list-row-title');
  await expect(row).toHaveText('Lord Aldric Thorne and Grimbold Ironhand are rivals');
  await row.getByRole('link', { name: 'Grimbold Ironhand' }).click();
  await expect(page.locator('.page-title')).toHaveText('Grimbold Ironhand');
  await expect(page.locator('.rel-row .list-row-title')).toHaveText('Lord Aldric Thorne and Grimbold Ironhand are rivals');
  const [r] = await rels(page);
  expect([r.from_id, r.to_id, r.directed]).toEqual([ald.id, grim.id, false]);
});

test('one-way relationship with swap; a new name becomes a stub', async ({ page }) => {
  const ald = await mk(page, 'Lord Aldric Thorne');
  await page.goto(`/#/entity/${ald.id}`);
  await add(page, { type: 'works for', withName: 'Hollow King' });
  await expect(page.locator('.rel-row .list-row-title')).toHaveText('Lord Aldric Thorne works for Hollow King');
  await add(page, { type: 'owes', withName: 'Wren', swap: true });
  await expect(page.locator('.rel-row .list-row-title').first()).toHaveText('Wren Ashdown owes Lord Aldric Thorne');
  const hk = await page.evaluate(() => window.__satchel.db.entities.filter((e) => e.name === 'Hollow King').first());
  expect([hk.stub, hk.type_id]).toEqual([true, null]);
});

test('your own words: unknown types are one-way', async ({ page }) => {
  const ald = await mk(page, 'Aldric');
  await mk(page, 'Vex');
  await page.goto(`/#/entity/${ald.id}`);
  await add(page, { other: 'Sworn To', withName: 'vex' });
  await expect(page.locator('.rel-row .list-row-title')).toHaveText('Aldric sworn to Vex');
});

test('notes on a relationship save in place; delete is confirmed', async ({ page }) => {
  const a = await mk(page, 'Aldric');
  await mk(page, 'Vex');
  await page.goto(`/#/entity/${a.id}`);
  await add(page, { type: 'family', withName: 'vex' });
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  const notes = page.getByLabel('Notes on: Aldric and Vex are family');
  await notes.fill('Vex is his SISTER');
  await notes.blur();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.locator('.rel-row .list-row-detail')).toHaveText('Vex is his SISTER');
  await page.locator('.rel-row').getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('dialog', { name: 'Delete “Aldric and Vex are family”?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No relationships yet.')).toBeVisible();
  expect((await rels(page))[0].deleted).toBe(true);
});

test('diagram: the entity in the middle, one node per connection, nodes link', async ({ page }) => {
  const a = await mk(page, 'Aldric');
  const others = [];
  for (const n of ['Vex', 'Grimbold', 'Mira']) others.push(await mk(page, n));
  await page.evaluate(([aid, ids]) => Promise.all(ids.map((id, i) => window.__satchel.data.createRelationship({ from_id: aid, to_id: id, type: ['ally', 'owes', 'works for'][i] }))), [a.id, others.map((o) => o.id)]);
  await page.goto(`/#/entity/${a.id}`);
  const svg = page.getByRole('img', { name: 'Connections diagram: Aldric and 3 connections' });
  await expect(svg).toBeVisible();
  await expect(svg.locator('.connections-node')).toHaveCount(4);
  await expect(svg.locator('.connections-node.is-center text')).toHaveText('Aldric');
  expect((await svg.locator('.connections-label').allTextContents()).sort()).toEqual(['ally', 'owes', 'works for']);
  await svg.locator('a.connections-node', { hasText: 'Mira' }).click();
  await expect(page.locator('.page-title')).toHaveText('Mira');
});

test('the character page has relationships too', async ({ page }) => {
  await mk(page, 'Lyra Ashdown');
  await page.goto('/#/character');
  await add(page, { type: 'family', withName: 'lyra' });
  await expect(page.locator('.rel-row .list-row-title')).toHaveText('Wren Ashdown and Lyra Ashdown are family');
});

test('recall cards show relationships as plain sentences', async ({ page }) => {
  const a = await mk(page, 'Lord Aldric Thorne');
  const hk = await mk(page, 'Hollow King');
  await page.evaluate(([x, y]) => window.__satchel.data.createRelationship({ from_id: x, to_id: y, type: 'works for' }), [a.id, hk.id]);
  await page.locator('.session-btn').click();
  await page.getByRole('combobox', { name: 'Note' }).pressSequentially('aldric again');
  await expect(page.locator('.recall-card', { hasText: 'Lord Aldric Thorne' })).toContainText('Lord Aldric Thorne works for Hollow King');
});

test('phone width: entity page with relationships has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  const a = await mk(page, 'Lord Aldric Thorne of the Mill');
  const b = await mk(page, 'Grimbold Ironhand the Moneylender');
  await page.evaluate(([x, y]) => window.__satchel.data.createRelationship({ from_id: x, to_id: y, type: 'rival' }), [a.id, b.id]);
  await page.goto(`/#/entity/${a.id}`);
  await expect(page.locator('.connections svg')).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});
