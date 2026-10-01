import { test, expect } from '@playwright/test';
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

test('Merging the same kit twice changes nothing the second time', async ({ browser }) => {
  const phone = await device(browser);
  await start(phone);
  await say(phone, 'only note');
  const kit = await pack(phone);
  const pc = await device(browser);
  await chooseKit(pc, kit);
  await pc.getByRole('button', { name: 'Unpack', exact: true }).click();
  await expect(pc.locator('.note__text')).toHaveText(['only note']);
  await chooseKit(pc, kit);
  await expect(pc.getByRole('dialog')).toContainText('0 added, 0 updated');
  await pc.getByRole('button', { name: 'Merge' }).click();
  await expect(pc.locator('.note__text')).toHaveText(['only note']);
});

test('A different character cannot be merged', async ({ browser }) => {
  const phone = await device(browser);
  await start(phone, 'Kael');
  const kit = await pack(phone);
  const pc = await device(browser);
  await start(pc, 'Mira');
  await chooseKit(pc, kit);
  const dialog = pc.getByRole('dialog');
  await expect(dialog).toContainText('different character: Kael');
  await expect(dialog.getByRole('button', { name: 'Merge' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(pc.locator('.topbar__title')).toHaveText('Mira');
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
