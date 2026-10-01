import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Two browser profiles stand in for two devices (phone and PC).
const URL = 'http://localhost:8123/';
const box = (page) => page.getByLabel('Note');

async function device(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL);
  return page;
}

async function start(page, name = 'Kael') {
  await page.getByLabel('Character name').fill(name);
  await page.getByRole('button', { name: 'Start' }).click();
  await enterSession(page);
  await expect(box(page)).toBeFocused();
}

async function say(page, text) {
  await box(page).pressSequentially(text);
  await box(page).press('Enter');
  await expect(box(page)).toHaveValue('');
}

async function pack(page) {
  await page.getByRole('button', { name: 'Menu' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Pack kit/ }).click(),
  ]);
  return download.path();
}

async function chooseKit(page, path) {
  // Wait until either the first-run screen or the main screen has rendered.
  const firstRun = page.getByRole('button', { name: 'Unpack a kit' });
  await expect(firstRun.or(page.getByRole('button', { name: 'Menu' }))).toBeVisible();
  if (await firstRun.isVisible()) {
    await page.getByRole('button', { name: 'Unpack a kit' }).click();
  } else {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: /Unpack kit/ }).click();
  }
  await page.getByLabel('Kit file').setInputFiles(path);
}

const liveEntities = (page) =>
  page.evaluate(async () => (await window.__satchel.db.entities.toArray()).filter((e) => !e.deleted));

test('New: unpack a kit onto an empty device', async ({ browser }) => {
  const phone = await device(browser);
  await start(phone);
  await say(phone, 'met @Grimbold at the forge');
  await say(phone, 'second note');
  const kit = await pack(phone);

  const pc = await device(browser);
  await chooseKit(pc, kit);
  const dialog = pc.getByRole('dialog', { name: 'Unpack kit' });
  await expect(dialog).toContainText('Unpack Kael');
  await expect(dialog).toContainText('2 notes, 2 entities');
  await dialog.getByRole('button', { name: 'Unpack', exact: true }).click();
  await enterSession(pc);

  await expect(pc.locator('.topbar__title')).toHaveText('Kael');
  await expect(pc.locator('.note__text')).toHaveText(['met Grimbold at the forge', 'second note']);
  await expect(pc.locator('.topbar .badge')).toHaveText('Backed up');
});

test('Merge: two devices combine, duplicate stubs become one', async ({ browser }) => {
  const phone = await device(browser);
  await start(phone);
  await say(phone, 'shared start');
  const pc = await device(browser);
  await chooseKit(pc, await pack(phone));
  await pc.getByRole('button', { name: 'Unpack', exact: true }).click();
  await enterSession(pc);
  await expect(pc.locator('.note__text')).toHaveText(['shared start']);

  // Both devices meet "Grimbold" separately before syncing.
  await say(phone, 'phone: met @Grimbold');
  await say(pc, 'pc: paid @grimbold');

  await chooseKit(pc, await pack(phone));
  const dialog = pc.getByRole('dialog', { name: 'Unpack kit' });
  await expect(dialog).toContainText('Merge Kael');
  await expect(dialog).toContainText('1 duplicate stub combined');
  await dialog.getByRole('button', { name: 'Merge' }).click();
  await expect(pc.getByRole('status')).toContainText('Kit merged');

  await expect(pc.locator('.note__text')).toHaveText(['shared start', 'phone: met Grimbold', 'pc: paid Grimbold']);
  const grims = (await liveEntities(pc)).filter((e) => e.name.toLowerCase() === 'grimbold');
  expect(grims).toHaveLength(1);
  const notes = await pc.evaluate(() => window.__satchel.db.notes.toArray());
  for (const n of notes.filter((x) => x.text.includes('rimbold'))) expect(n.mentions).toEqual([grims[0].id]);

  // And back the other way: the phone ends up with the same single Grimbold.
  await chooseKit(phone, await pack(pc));
  await phone.getByRole('button', { name: 'Merge' }).click();
  await expect(phone.locator('.note__text')).toHaveCount(3);
  const phoneGrims = (await liveEntities(phone)).filter((e) => e.name.toLowerCase() === 'grimbold');
  expect(phoneGrims.map((e) => e.id)).toEqual(grims.map((e) => e.id));
});

test('Merge does not count as unsaved changes; local edits stay counted', async ({ browser }) => {
  const badge = (p) => p.locator('.topbar .badge');
  const phone = await device(browser);
  await start(phone);
  await say(phone, 'shared');
  const pc = await device(browser);
  await chooseKit(pc, await pack(phone));
  await pc.getByRole('button', { name: 'Unpack', exact: true }).click();
  await enterSession(pc);
  await expect(badge(pc)).toHaveText('Backed up');

  // Phone adds notes; PC merges them: still backed up.
  await say(phone, 'phone one');
  await say(phone, 'phone two');
  await chooseKit(pc, await pack(phone));
  await pc.getByRole('button', { name: 'Merge' }).click();
  await expect(pc.locator('.note__text')).toHaveCount(3);
  await expect(badge(pc)).toHaveText('Backed up');

  // A local edit on the PC counts, and still counts after another merge.
  await say(pc, 'pc only');
  await expect(badge(pc)).toHaveText('1 change since backup');
  await say(phone, 'phone three');
  await chooseKit(pc, await pack(phone));
  await pc.getByRole('button', { name: 'Merge' }).click();
  await expect(pc.locator('.note__text')).toHaveCount(5);
  await expect(badge(pc)).toHaveText('1 change since backup');
});

test('Merging the same kit twice changes nothing the second time', async ({ browser }) => {
  const phone = await device(browser);
  await start(phone);
  await say(phone, 'only note');
  const kit = await pack(phone);
  const pc = await device(browser);
  await chooseKit(pc, kit);
  await pc.getByRole('button', { name: 'Unpack', exact: true }).click();
  await enterSession(pc);
  await expect(pc.locator('.note__text')).toHaveText(['only note']);
  await chooseKit(pc, kit);
  await expect(pc.getByRole('dialog')).toContainText('0 added, 0 updated');
  await pc.getByRole('button', { name: 'Merge' }).click();
  await expect(pc.locator('.note__text')).toHaveText(['only note']);
});

test('A different character cannot be merged; Cancel keeps it', async ({ browser }) => {
  const phone = await device(browser);
  await start(phone, 'Kael');
  const kit = await pack(phone);
  const pc = await device(browser);
  await start(pc, 'Mira');
  await chooseKit(pc, kit);
  const dialog = pc.getByRole('dialog');
  await expect(dialog).toContainText('different character: Kael');
  await expect(dialog.getByRole('button', { name: 'Merge' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(pc.locator('.topbar__title')).toHaveText('Mira');
});

test('Replace: typed name required, backup downloads first, then the kit replaces', async ({ browser }) => {
  const phone = await device(browser);
  await start(phone, 'Kael');
  await say(phone, 'kael note');
  const kit = await pack(phone);

  const pc = await device(browser);
  await start(pc, 'Mira');
  await say(pc, 'mira note one');
  await say(pc, 'mira met @Grimbold');
  await chooseKit(pc, kit);
  await pc.getByRole('button', { name: 'Replace…' }).click();

  const confirm = pc.getByRole('dialog', { name: 'Replace with kit' });
  await expect(confirm).toContainText('This deletes Mira from this device: 2 notes, 2 entities');
  const go = confirm.getByRole('button', { name: 'Replace with Kael' });
  await expect(go).toBeDisabled();
  await confirm.getByLabel(/Type Mira to confirm/).fill('Mir');
  await expect(go).toBeDisabled();
  await confirm.getByLabel(/Type Mira to confirm/).fill('mira');
  await expect(go).toBeEnabled();

  const [backup] = await Promise.all([pc.waitForEvent('download'), go.click()]);
  expect(backup.suggestedFilename()).toMatch(/^mira-.*\.kit$/);
  await expect(pc.locator('.topbar__title')).toHaveText('Kael');
  await expect(pc.locator('.note__text')).toHaveText(['kael note']);
  await expect(pc.getByRole('status')).toContainText('Backup of the old character: mira-');

  // The backup really holds Mira: unpacking it offers to replace Kael with Mira.
  await chooseKit(pc, await backup.path());
  await expect(pc.getByRole('dialog')).toContainText('different character: Mira');
});

test('Replace instead of merge (same character) discards local changes', async ({ browser }) => {
  const phone = await device(browser);
  await start(phone);
  await say(phone, 'shared');
  const kit = await pack(phone);
  const pc = await device(browser);
  await chooseKit(pc, kit);
  await pc.getByRole('button', { name: 'Unpack', exact: true }).click();
  await enterSession(pc);
  await say(pc, 'only on pc');
  await chooseKit(pc, kit);
  await pc.getByRole('button', { name: 'Replace instead…' }).click();
  await pc.getByLabel(/Type Kael to confirm/).fill('Kael');
  await Promise.all([pc.waitForEvent('download'), pc.getByRole('button', { name: 'Replace with Kael' }).click()]);
  await expect(pc.locator('.note__text')).toHaveText(['shared']);
});

test('New character: wipes after a backup and returns to the first screen', async ({ browser }) => {
  const pc = await device(browser);
  await start(pc, 'Kael');
  await say(pc, 'about to go');
  await pc.getByRole('button', { name: 'Menu' }).click();
  await pc.getByRole('menuitem', { name: 'New character…' }).click();
  const confirm = pc.getByRole('dialog', { name: 'New character' });
  await expect(confirm).toContainText('This deletes Kael from this device: 1 note, 1 entity');
  await confirm.getByLabel(/Type Kael to confirm/).fill('KAEL');
  const [backup] = await Promise.all([
    pc.waitForEvent('download'),
    confirm.getByRole('button', { name: 'Delete and start fresh' }).click(),
  ]);
  expect(backup.suggestedFilename()).toMatch(/^kael-.*\.kit$/);
  await expect(pc.getByLabel('Character name')).toBeVisible();
  const left = await pc.evaluate(async () => ({
    notes: await window.__satchel.db.notes.count(),
    entities: await window.__satchel.db.entities.count(),
    bundle: await window.__satchel.db.meta.get('bundle_id'),
  }));
  expect(left).toEqual({ notes: 0, entities: 0, bundle: undefined });
});

test('New character: Cancel keeps everything', async ({ browser }) => {
  const pc = await device(browser);
  await start(pc, 'Kael');
  await say(pc, 'stay');
  await pc.getByRole('button', { name: 'Menu' }).click();
  await pc.getByRole('menuitem', { name: 'New character…' }).click();
  await pc.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(pc.locator('.note__text')).toHaveText(['stay']);
});

test('A file that is not a kit shows an error and changes nothing', async ({ browser }) => {
  const dir = await mkdtemp(join(tmpdir(), 'satchel-'));
  const bogus = join(dir, 'notes.kit');
  await writeFile(bogus, 'definitely not a zip');
  const pc = await device(browser);
  await start(pc);
  await say(pc, 'keep me');
  await chooseKit(pc, bogus);
  await expect(pc.getByRole('status')).toContainText("isn't a kit file");
  await expect(pc.getByRole('dialog')).toHaveCount(0);
  await expect(pc.locator('.note__text')).toHaveText(['keep me']);
});

test('Cancel leaves the device untouched', async ({ browser }) => {
  const phone = await device(browser);
  await start(phone);
  await say(phone, 'from phone');
  const kit = await pack(phone);
  const pc = await device(browser);
  await chooseKit(pc, kit);
  await pc.getByRole('button', { name: 'Cancel' }).click();
  await expect(pc.getByLabel('Character name')).toBeVisible();
});
