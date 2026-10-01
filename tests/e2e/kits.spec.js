import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { zipSync, strToU8 } from '../../vendor/fflate.mjs';
import { newCharacter } from './helpers.js';

// Packs a kit by tapping the badge; waits for the backup to be recorded (the state,
// not the download event: v1 lesson 7). Returns the downloaded file's path and name.
async function pack(page) {
  const before = await page.evaluate(async () => (await window.__satchel.data.getMeta('backup')).last_backup_at);
  const dl = page.waitForEvent('download');
  await page.locator('.badge').click();
  const d = await dl;
  const path = test.info().outputPath(d.suggestedFilename());
  await d.saveAs(path);
  await expect.poll(() => page.evaluate(async () => (await window.__satchel.data.getMeta('backup')).last_backup_at)).not.toBe(before);
  return { path, name: d.suggestedFilename() };
}

async function unpack(page, path) {
  await page.getByRole('button', { name: 'Menu' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Unpack kit' }).click();
  await (await chooser).setFiles(path);
}

const count = (page, table, where = () => true) => page.evaluate(([t, w]) => window.__satchel.db.table(t).filter(new Function(`return (${w})`)()).count(), [table, where.toString()]);
const ready = (page) => page.waitForFunction(() => window.__satchel?.data);

test('pack kit: named after the character, badge goes green, menu does the same', async ({ page }) => {
  await newCharacter(page, 'Kael Brightwater');
  await page.evaluate(() => window.__satchel.data.addNote('first note'));
  await expect(page.locator('.badge')).toHaveText('1 change since backup');
  const kit = await pack(page);
  expect(kit.name).toMatch(/^kael-brightwater-\d{4}-\d{2}-\d{2}-\d{4}\.kit$/);
  await expect(page.locator('.badge')).toHaveText('Backed up');
  await expect(page.getByText(`Kit packed: ${kit.name}`)).toBeVisible();
});

test('two devices: New on B, edits on both, Merge both ways; merges are not unsaved changes', async ({ browser }) => {
  const a = await (await browser.newContext({ acceptDownloads: true })).newPage();
  const b = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await newCharacter(a, 'Wren Ashdown');
  await a.evaluate(async () => {
    const d = window.__satchel.data;
    await d.addNote('A1: paid @Grimbold 20gp #debts');
    await d.addNote('A2: met @Mira');
  });
  const kitA = await pack(a);

  // Device B: first run → Unpack a kit
  await b.goto('/');
  await ready(b);
  const chooser = b.waitForEvent('filechooser');
  await b.getByRole('button', { name: 'Unpack a kit' }).click();
  await (await chooser).setFiles(kitA.path);
  await expect(b.locator('.topbar-home')).toHaveText('Wren Ashdown');
  await expect(b.locator('.badge')).toHaveText('Backed up');
  expect(await count(b, 'notes')).toBe(2);

  // Both devices change things
  await b.evaluate(() => window.__satchel.data.addNote('B1: @Grimbol wants 5gp'));
  await a.evaluate(() => window.__satchel.data.addNote('A3: rain'));
  const kitB = await pack(b);

  // A merges B's kit
  await unpack(a, kitB.path);
  const sheet = a.getByRole('dialog', { name: `Unpack ${kitB.name}?` });
  await expect(sheet).toContainText('Merge keeps everything from both');
  await sheet.getByRole('button', { name: 'Merge' }).click();
  await expect(a.getByText(/Kit unpacked into your satchel: \d+ added, \d+ updated\./)).toBeVisible();
  expect(await count(a, 'notes')).toBe(4);
  // A's own change (A3) is still unsaved; the merge didn't add to it.
  await expect(a.locator('.badge')).toHaveText('1 change since backup');

  // B merges A's newer kit and ends up with the same notes
  const kitA2 = await pack(a);
  await unpack(b, kitA2.path);
  await b.getByRole('dialog', { name: `Unpack ${kitA2.name}?` }).getByRole('button', { name: 'Merge' }).click();
  await expect(b.getByText(/Kit unpacked into your satchel/)).toBeVisible();
  const texts = (p) => p.evaluate(async () => (await window.__satchel.db.notes.toArray()).map((n) => n.text.replace(/\(.*?\)/g, '')).sort());
  expect(await texts(b)).toEqual(await texts(a));
  await expect(b.locator('.badge')).toHaveText('Backed up');

  // Merging the same kit again changes nothing
  await unpack(b, kitA2.path);
  await b.getByRole('dialog', { name: `Unpack ${kitA2.name}?` }).getByRole('button', { name: 'Merge' }).click();
  await expect(b.getByText('Kit unpacked into your satchel: 0 added, 0 updated.')).toBeVisible();
});

test('two devices: the same new name typed on both folds into one stub on merge', async ({ browser }) => {
  const a = await (await browser.newContext({ acceptDownloads: true })).newPage();
  const b = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await newCharacter(a, 'Wren Ashdown');
  const kit0 = await pack(a);
  await b.goto('/');
  await ready(b);
  const chooser = b.waitForEvent('filechooser');
  await b.getByRole('button', { name: 'Unpack a kit' }).click();
  await (await chooser).setFiles(kit0.path);
  await expect(b.locator('.topbar-home')).toHaveText('Wren Ashdown');
  await a.evaluate(() => window.__satchel.data.addNote('met @Pip on A'));
  await b.evaluate(() => window.__satchel.data.addNote('met @Pip on B'));
  const kitB = await pack(b);
  await unpack(a, kitB.path);
  await a.getByRole('dialog', { name: `Unpack ${kitB.name}?` }).getByRole('button', { name: 'Merge' }).click();
  await expect(a.getByText(/Kit unpacked into your satchel/)).toBeVisible();
  expect(await count(a, 'entities', (e) => e.stub && !e.deleted)).toBe(1);
  const mentions = await a.evaluate(async () => [...new Set((await window.__satchel.db.notes.toArray()).flatMap((n) => n.mentions))]);
  expect(mentions).toHaveLength(1);
});

test('Replace: a different character, typed name, backup downloads first', async ({ browser }) => {
  const a = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await newCharacter(a, 'Kael');
  const kael = await pack(a);
  const b = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await newCharacter(b, 'Wren Ashdown');
  await b.evaluate(() => window.__satchel.data.addNote('wren stuff'));
  await unpack(b, kael.path);
  const sheet = b.getByRole('dialog', { name: `Unpack ${kael.name}?` });
  await expect(sheet).toContainText('different character');
  await expect(sheet.getByRole('button', { name: 'Merge' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Replace…' }).click();
  const confirm = b.getByRole('dialog', { name: 'Replace Wren Ashdown?' });
  await expect(confirm.getByRole('button', { name: 'Replace…' })).toBeDisabled();
  await confirm.getByLabel('Type “Wren Ashdown” to confirm').fill('Wren Ashdown');
  const backup = b.waitForEvent('download');
  await confirm.getByRole('button', { name: 'Replace…' }).click();
  expect((await backup).suggestedFilename()).toMatch(/^wren-ashdown-/);
  await expect(b.locator('.topbar-home')).toHaveText('Kael');
  expect(await count(b, 'notes')).toBe(0);
});

test('refusals: not a zip, not a kit, damaged, newer, v1; nothing changes', async ({ page }) => {
  await newCharacter(page, 'Wren Ashdown');
  const dir = test.info().outputPath('');
  const write = (name, bytes) => { const p = `${dir}/${name}`; writeFileSync(p, bytes); return p; };
  const zip = (files) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
  const doc = (over) => JSON.stringify({ format: 'satchel', schema_version: 3, bundle_id: 'x', pc_entity_id: 'p', entities: [{ id: 'p', name: 'X' }], ...over });
  const cases = [
    [write('photo.kit', Buffer.from('jpeg?')), 'That isn’t a Satchel kit (it’s not a zip file).'],
    [write('other.kit', zip({ 'a.txt': 'hi' })), 'That zip isn’t a Satchel kit (no character.json inside).'],
    [write('broken.kit', zip({ 'character.json': '{oops' })), 'That kit is damaged: its character.json can’t be read.'],
    [write('future.kit', zip({ 'character.json': doc({ schema_version: 9 }) })), 'That kit was made by a newer Satchel. Reload this page to update, then try again.'],
    [write('old.kit', zip({ 'character.json': doc({ schema_version: 2 }) })), 'That kit is from Satchel v1, which v2 can’t open.'],
  ];
  for (const [path, msg] of cases) {
    await unpack(page, path);
    await expect(page.getByText(msg)).toBeVisible();
  }
  await expect(page.locator('.topbar-home')).toHaveText('Wren Ashdown');
});

test('demo character: first run loads it with the expected counts, backed up', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByRole('button', { name: 'Try the demo character' }).click();
  await expect(page.locator('.topbar-home')).toHaveText('Wren Ashdown');
  await expect(page.locator('.badge')).toHaveText('Backed up');
  expect(await count(page, 'notes', (n) => !n.deleted)).toBe(47);
  expect(await count(page, 'entities', (e) => !e.deleted)).toBe(23);
  expect(await count(page, 'files', (f) => !f.deleted)).toBe(1);
  await expect(page.locator('.home-count')).toContainText('12 new notes');
  await page.goto('/#/world/stubs');
  await expect(page.locator('.list-row-title')).toHaveText(['Grimbol', 'Hollow King', 'Pip', 'Vex']);
});

test('end-of-session nudge: unsaved changes offer a kit; Not now dismisses', async ({ page }) => {
  await newCharacter(page, 'Wren Ashdown');
  await page.locator('.session-btn').click();
  await page.getByRole('combobox', { name: 'Note' }).fill('a note');
  await page.getByRole('combobox', { name: 'Note' }).press('Enter');
  await expect(page.locator('.feed-item')).toHaveCount(1);
  await page.locator('.session-btn').click();
  const nudge = page.locator('.nudge');
  await expect(nudge).toContainText('Session over. Pack your kit before you go?');
  await nudge.getByRole('button', { name: 'Not now' }).click();
  await expect(nudge).toHaveCount(0);
  await page.locator('.session-btn').click();
  await page.locator('.session-btn').click();
  const dl = page.waitForEvent('download');
  await page.locator('.nudge').getByRole('button', { name: 'Pack kit' }).click();
  await dl;
  await expect(page.locator('.badge')).toHaveText('Backed up');
  await page.locator('.session-btn').click();
  await page.locator('.session-btn').click();
  await expect(page.locator('.nudge')).toHaveCount(0);
});

test('New character from Settings: typed name, backup first, fresh start', async ({ page }) => {
  await newCharacter(page, 'Wren Ashdown');
  await page.evaluate(() => window.__satchel.data.addNote('old note'));
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'New character' }).click();
  await expect(page.locator('.page-title')).toHaveText('Settings');
  await page.getByLabel('New character’s name').fill('Kael');
  await page.getByRole('button', { name: 'New character…' }).click();
  const sheet = page.getByRole('dialog', { name: 'Start a new character instead of Wren Ashdown?' });
  await sheet.getByLabel('Type “Wren Ashdown” to confirm').fill('wren ashdown');
  const dl = page.waitForEvent('download');
  await sheet.getByRole('button', { name: 'Start over' }).click();
  expect((await dl).suggestedFilename()).toMatch(/^wren-ashdown-/);
  await expect(page.locator('.topbar-home')).toHaveText('Kael');
  expect(await count(page, 'notes')).toBe(0);
  await expect(page.locator('.badge')).toHaveText('Not backed up');
});

test('Settings shows backup status; Help opens and closes', async ({ page }) => {
  await newCharacter(page, 'Wren Ashdown');
  await page.goto('/#/settings');
  await expect(page.getByText('No kit packed yet on this device.')).toBeVisible();
  await pack(page);
  await expect(page.getByText(/Last kit packed .*\. No changes since\./)).toBeVisible();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'How it works' }).click();
  const help = page.getByRole('dialog', { name: 'How it works' });
  await expect(help).toContainText('Other devices');
  await help.getByRole('button', { name: 'Close' }).click();
  await expect(help).toHaveCount(0);
});
