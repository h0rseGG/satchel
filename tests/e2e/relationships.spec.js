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

const entityByName = (page, name) => page.evaluate(async (n) =>
  (await window.__satchel.db.entities.toArray()).find((e) => e.name === n && !e.deleted), name);

async function addRel(page, { type, other, direction = null, notes = '' }) {
  const s = page.getByRole('region', { name: 'Relationships' });
  await s.getByLabel('Relationship type').fill(type);
  await s.getByLabel('With').fill(other);
  if (direction) await s.getByLabel('Direction').selectOption(direction);
  if (notes) await s.getByLabel('Relationship notes').fill(notes);
  await s.getByRole('button', { name: 'Add' }).click();
}
const relRows = (page) => page.getByRole('region', { name: 'Relationships' }).locator('.rels__row');

test('character page: "Kael owes Grimbold" shows on both ends with links', async ({ page }) => {
  await start(page);
  await note(page, 'met @Grimbold');
  await page.goto('/#/character');
  await addRel(page, { type: 'owes', other: 'grimbold', notes: '20 gp' });
  await expect(relRows(page)).toHaveText([/Kael owes Grimbold · 20 gp/]);
  await relRows(page).getByRole('link', { name: 'Grimbold' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grimbold');
  await expect(relRows(page)).toHaveText([/Kael owes Grimbold/]);
  const r = await page.evaluate(async () => (await window.__satchel.db.relationships.toArray())[0]);
  const g = await entityByName(page, 'Grimbold');
  const k = await entityByName(page, 'Kael');
  expect([r.from_id, r.to_id, r.directed, r.type]).toEqual([k.id, g.id, true, 'owes']);
});

test('ally defaults to both ways; direction can be flipped', async ({ page }) => {
  await start(page);
  await note(page, '@Mira and @Thieves_Guild');
  const mira = await entityByName(page, 'Mira');
  await page.goto(`/#/entity/${mira.id}`);
  await page.getByRole('region', { name: 'Relationships' }).getByLabel('Relationship type').fill('ally');
  await expect(page.getByRole('region', { name: 'Relationships' }).getByLabel('Direction')).toHaveValue('both');
  await page.getByRole('region', { name: 'Relationships' }).getByLabel('With').fill('Kael');
  await page.getByRole('region', { name: 'Relationships' }).getByRole('button', { name: 'Add' }).click();
  await addRel(page, { type: 'member of', other: 'Thieves Guild' });
  await addRel(page, { type: 'works for', other: 'Kael', direction: 'in' });
  await expect(relRows(page)).toHaveText([/Mira ↔ Kael \(ally\)/, /Mira member of Thieves Guild/, /Kael works for Mira/]);
});

test('an unknown name becomes a stub; self-relationships are refused', async ({ page }) => {
  await start(page);
  await page.goto('/#/character');
  await addRel(page, { type: 'family', other: 'Lyra' });
  const lyra = await entityByName(page, 'Lyra');
  expect(lyra.stub).toBe(true);
  await addRel(page, { type: 'rival', other: 'kael' });
  await expect(page.getByRole('status')).toContainText('two different entities');
});

test('remove a relationship', async ({ page }) => {
  await start(page);
  await page.goto('/#/character');
  await addRel(page, { type: 'owes', other: 'Grimbold' });
  await expect(relRows(page)).toHaveCount(1);
  await relRows(page).getByRole('button', { name: /Remove relationship/ }).click();
  await expect(relRows(page)).toHaveCount(0);
});

test('relationships show on recall cards in session', async ({ page }) => {
  await start(page);
  await note(page, 'met @Grimbold');
  await page.goto('/#/character');
  await addRel(page, { type: 'owes', other: 'Grimbold' });
  await expect(relRows(page)).toHaveCount(1);
  await page.goto('/#/');
  await enterSession(page);
  await box(page).pressSequentially('grimbold');
  await expect(page.locator('.card__rels')).toHaveText('Kael owes Grimbold');
  await expect(page.locator('.card__rels a')).toHaveCount(0);   // plain text in session
});

test('connections diagram: one node per other entity, shared lines, links work', async ({ page }) => {
  await start(page);
  await note(page, '@Grimbold and @Mira');
  await page.goto('/#/character');
  await expect(page.locator('.connections')).toHaveCount(0);   // nothing yet, no empty diagram
  await addRel(page, { type: 'owes', other: 'Grimbold' });
  await addRel(page, { type: 'rival', other: 'Grimbold' });
  await addRel(page, { type: 'ally', other: 'Mira' });
  const svg = page.getByRole('img', { name: /^Connections of Kael/ });
  await expect(svg).toHaveAttribute('aria-label', 'Connections of Kael: Grimbold, Mira');
  await expect(svg.locator('circle')).toHaveCount(2);
  await expect(svg.locator('.connections__type')).toHaveText(['owes, rival', 'ally']);
  await svg.locator('a', { hasText: 'Mira' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mira');
  await expect(page.getByRole('img', { name: /^Connections of Mira/ })).toBeVisible();
});

test('merging entities moves their relationships', async ({ page }) => {
  await start(page);
  await note(page, '@Grimbold @Grimbolt');
  await page.goto('/#/character');
  await addRel(page, { type: 'owes', other: 'Grimbolt' });
  await expect(relRows(page)).toHaveCount(1);
  const typo = await entityByName(page, 'Grimbolt');
  await page.goto(`/#/entity/${typo.id}`);
  await page.getByRole('button', { name: 'Merge into…' }).click();
  await page.getByLabel('Find entity').fill('grimbold');
  await page.getByRole('button', { name: /Grimbold/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Merge' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grimbold');
  await expect(relRows(page)).toHaveText([/Kael owes Grimbold/]);
});
