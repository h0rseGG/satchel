import { test, expect } from '@playwright/test';
import { newCharacter, noSidewaysScroll } from './helpers.js';

const mk = (page, name, extra = {}) => page.evaluate(([n, x]) => window.__satchel.data.createEntity({ name: n, type_id: 'type-npc', ...x }), [name, extra]);
const get = (page, id) => page.evaluate((i) => window.__satchel.db.entities.get(i), id);

test.beforeEach(async ({ page }) => {
  await newCharacter(page, 'Wren Ashdown');
});

test('done when: a custom type with a link field works end to end', async ({ page }) => {
  const rook = await mk(page, 'Captain Rook Harlow');
  await page.goto('/#/world');
  // Add the Ship type
  await page.getByRole('button', { name: 'Add type' }).click();
  const addType = page.getByRole('form', { name: 'Add type' });
  await addType.getByLabel('Name (one)').fill('Ship');
  await addType.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.list-row-title', { hasText: /^Ships$/ })).toBeVisible();
  // Give it a Captain link field to NPCs
  const shipRow = page.locator('.type-row', { hasText: 'Ship / Ships' });
  await shipRow.getByRole('button', { name: 'Edit' }).click();
  await shipRow.getByRole('button', { name: 'Add field' }).click();
  const addField = shipRow.getByRole('form', { name: 'Add field' });
  await addField.getByLabel('Field name').fill('Captain');
  await addField.getByLabel('Kind').selectOption('link');
  await addField.getByLabel('Links to').selectOption({ label: 'NPCs' });
  await addField.getByRole('button', { name: 'Save' }).click();
  await expect(shipRow.getByLabel(/Link → NPC/)).toHaveValue('Captain');
  // Add a ship from its list
  await page.locator('a.list-row-title', { hasText: /^Ships$/ }).click();
  await expect(page.locator('.page-title')).toHaveText('Ships');
  await page.getByRole('button', { name: 'Add ship' }).click();
  await page.getByRole('form', { name: 'Add ship' }).getByLabel('Name').fill('The Gull’s Wake');
  await page.getByRole('form', { name: 'Add ship' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.page-title')).toHaveText('The Gull’s Wake');
  await expect(page.locator('.topbar-crumbs')).toHaveText('Home › World › Ships › The Gull’s Wake');
  // Link the captain through the picker
  const picker = page.getByRole('combobox', { name: 'Captain' });
  await picker.fill('rook');
  await picker.press('Enter');
  const link = page.locator('.link-field a.mention');
  await expect(link).toHaveText('Captain Rook Harlow');
  await page.reload();
  await expect(page.locator('.link-field a.mention')).toHaveText('Captain Rook Harlow');
  await page.locator('.link-field a.mention').click();
  await expect(page.locator('.page-title')).toHaveText('Captain Rook Harlow');
  expect(page.url()).toContain(rook.id);
});

test('link picker: a new name makes a stub; Clear empties the link', async ({ page }) => {
  const ship = await page.evaluate(async () => {
    const d = window.__satchel.data;
    const t = await window.__satchel.data.createType({ label: 'Ship' });
    await window.__satchel.data.addField(t.id, { label: 'Captain', kind: 'link', link_type: 'type-npc' });
    return d.createEntity({ name: 'Gull', type_id: t.id });
  });
  await page.goto(`/#/entity/${ship.id}`);
  const picker = page.getByRole('combobox', { name: 'Captain' });
  await picker.fill('Vex');
  await expect(page.getByRole('listbox', { name: 'Captain' }).getByRole('option')).toHaveText(['New stub: Vex']);
  await picker.press('Enter');
  await expect(page.locator('.link-field a.mention')).toHaveText('Vex');
  const linked = (await get(page, ship.id)).fields;
  const vex = await get(page, Object.values(linked)[0]);
  expect([vex.name, vex.stub]).toEqual(['Vex', true]);
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('combobox', { name: 'Captain' })).toBeVisible();
});

test('World and Home show counts per type and stubs', async ({ page }) => {
  await mk(page, 'Grimbold');
  await mk(page, 'Millbrook', { type_id: 'type-location' });
  await page.evaluate(() => window.__satchel.data.addNote('met @Pip'));
  await page.goto('/#/');
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'World' }) });
  await expect(panel.locator('.count-list li')).toHaveText(['NPCs 1', 'Locations 1', 'Stubs 1']);
  await page.goto('/#/world');
  await expect(page.locator('.list-row', { hasText: 'Stubs' }).locator('.list-row-meta')).toHaveText('1');
});

test('rename a built-in type: label only, everywhere', async ({ page }) => {
  await mk(page, 'Grimbold');
  await page.goto('/#/world');
  const row = page.locator('.type-row', { hasText: 'NPC / NPCs' });
  await row.getByRole('button', { name: 'Edit' }).click();
  await row.getByLabel('Name (many)').fill('People');
  await row.getByLabel('Name (many)').blur();
  await expect(row.getByText('Built-in: can be renamed, not deleted.')).toBeVisible();
  await page.goto('/#/world/type-npc');
  await expect(page.locator('.page-title')).toHaveText('People');
  await expect(page.locator('.topbar-crumbs')).toHaveText('Home › World › People');
});

test('removing a field hides its values; re-adding it restores them', async ({ page }) => {
  const god = await page.evaluate(async () => {
    const d = window.__satchel.data;
    const t = await d.createType({ label: 'Deity', plural: 'Deities' });
    await d.addField(t.id, { label: 'Domain', kind: 'text' });
    return d.createEntity({ name: 'Auril', type_id: t.id });
  });
  await page.goto(`/#/entity/${god.id}`);
  await page.getByLabel('Domain').fill('Winter');
  await page.getByLabel('Domain').blur();
  await page.goto('/#/world');
  const row = page.locator('.type-row', { hasText: 'Deity / Deities' });
  await row.getByRole('button', { name: 'Edit' }).click();
  await row.getByRole('button', { name: 'Remove field Domain' }).click();
  await page.goto(`/#/entity/${god.id}`);
  await expect(page.getByLabel('Domain')).toHaveCount(0);
  await page.goto('/#/world');
  await row.getByRole('button', { name: 'Edit' }).click();
  await row.getByRole('button', { name: 'Add field' }).click();
  await row.getByRole('form', { name: 'Add field' }).getByLabel('Field name').fill('Domain');
  await row.getByRole('form', { name: 'Add field' }).getByRole('button', { name: 'Save' }).click();
  await page.goto(`/#/entity/${god.id}`);
  await expect(page.getByLabel('Domain')).toHaveValue('Winter');
});

test('deleting a type in use moves its entities first (confirmed)', async ({ page }) => {
  const god = await page.evaluate(async () => {
    const d = window.__satchel.data;
    const t = await d.createType({ label: 'Deity', plural: 'Deities' });
    return d.createEntity({ name: 'Auril', type_id: t.id });
  });
  await page.goto('/#/world');
  const row = page.locator('.type-row', { hasText: 'Deity / Deities' });
  await row.getByRole('button', { name: 'Edit' }).click();
  await row.getByLabel('Move its 1 deity to').selectOption({ label: 'Other' });
  await row.getByRole('button', { name: 'Delete type…' }).click();
  const sheet = page.getByRole('dialog', { name: 'Delete the Deity type?' });
  await expect(sheet).toContainText('1 deity move to Other');
  await sheet.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.type-row', { hasText: 'Deity / Deities' })).toHaveCount(0);
  expect((await get(page, god.id)).type_id).toBe('type-other');
});

test('type list: A–Z, filter by name, alias, tag or field value', async ({ page }) => {
  await mk(page, 'Zed');
  await mk(page, 'Mira Vane', { aliases: ['The Fox'] });
  await mk(page, 'Aldric', { tags: ['liar'] });
  await page.goto('/#/world/type-npc');
  const rows = page.locator('.list-row-title');
  await expect(rows).toHaveText(['Aldric', 'Mira Vane', 'Zed']);
  const filter = page.getByPlaceholder('Filter by name, alias, tag or field');
  await filter.fill('fox');
  await expect(rows).toHaveText(['Mira Vane']);
  await filter.fill('LIAR');
  await expect(rows).toHaveText(['Aldric']);
  await filter.fill('nobody');
  await expect(page.getByText('Nothing matches.')).toBeVisible();
});

test('entity page edits in place; outside updates do not overwrite what you are typing', async ({ page }) => {
  const g = await mk(page, 'Grimbold Ironhand');
  await page.goto(`/#/entity/${g.id}`);
  const summary = page.getByLabel('Summary (one line, shown on recall cards)');
  await summary.fill('Dwarf smith');
  await page.waitForTimeout(900);
  expect((await get(page, g.id)).summary).toBe('Dwarf smith');
  await summary.fill('Dwarf smith and moneylender');
  await page.evaluate((id) => window.__satchel.data.updateEntity(id, { summary: 'from another tab' }), g.id);
  await page.waitForTimeout(100);
  await expect(summary).toHaveValue('Dwarf smith and moneylender');
  await summary.blur();
  await expect.poll(async () => (await get(page, g.id)).summary).toBe('Dwarf smith and moneylender');
  const tags = page.getByLabel('Tags');
  await tags.fill('debts');
  await tags.press('Enter');
  await page.reload();
  await expect(page.locator('.chip')).toHaveText(['debts×']);
  await expect(page.locator('.page-title')).toHaveText('Grimbold Ironhand');
});

test('a stub gets a type from the Stubs list', async ({ page }) => {
  const n = await page.evaluate(() => window.__satchel.data.addNote('met @Pip'));
  await page.goto('/#/world/stubs');
  await page.getByLabel('Set type').selectOption({ label: 'NPC' });
  await expect(page.getByText('Pip: type set to NPC.')).toBeVisible();
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  expect((await get(page, n.mentions[0])).type_id).toBe('type-npc');
});

test('merge into: the typo stub folds into the real NPC, notes follow, its name becomes an alias', async ({ page }) => {
  const g = await mk(page, 'Grimbold Ironhand');
  const n = await page.evaluate(() => window.__satchel.data.addNote('@Grimbol wants 5gp'));
  const stubId = n.mentions[0];
  await page.goto(`/#/entity/${stubId}`);
  await page.getByRole('button', { name: 'Merge into…' }).click();
  const picker = page.getByRole('combobox', { name: 'Merge into' });
  await picker.fill('grimbold');
  await picker.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Merge Grimbol into Grimbold Ironhand?' });
  await sheet.getByRole('button', { name: 'Merge' }).click();
  await expect(page.locator('.page-title')).toHaveText('Grimbold Ironhand');
  await expect(page.locator('.chip')).toHaveText(['Grimbol×']);
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Notes that mention them' }) })).toContainText('wants 5gp');
  const note = await page.evaluate((id) => window.__satchel.db.notes.get(id), n.id);
  expect(note.mentions).toEqual([g.id]);
});

test('delete: confirmed; notes keep the name as plain text', async ({ page }) => {
  const n = await page.evaluate(() => window.__satchel.data.addNote('met @Pip today'));
  await page.goto(`/#/entity/${n.mentions[0]}`);
  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('dialog', { name: 'Delete Pip?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/#\/world\/stubs$/);
  await page.goto('/#/');
  await expect(page.locator('.mention.is-missing')).toHaveText('Pip');
});

test('phone width: World, type list and entity page have no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  const g = await mk(page, 'Grimbold Ironhand of the Very Long Name Mountains', { tags: ['debts', 'smith'], aliases: ['Grim'] });
  for (const h of ['/#/world', '/#/world/type-npc', `/#/entity/${g.id}`]) {
    await page.goto(h);
    await expect(page.locator('.page-title')).toBeVisible();
    expect(await noSidewaysScroll(page), h).toBe(true);
  }
});
