import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';
import { fakeGitHub } from '../fake-github.js';

// Two browser profiles (phone, PC) sync through one in-memory fake GitHub.
const URL = 'http://localhost:8123/';
const REPO = 'h0rseGG/satchel-data';
const TOKEN = 'good-token';
const box = (page) => page.getByLabel('Note');

async function device(browser, fake) {
  const ctx = await browser.newContext();
  await ctx.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    try {
      const { status, json } = await fake.handle(req.method(), req.url(), req.postData(), await req.allHeaders());
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
    } catch {
      await route.abort('internetdisconnected');
    }
  });
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

async function menu(page, item) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function setUp(page, deviceName, { repo = REPO, token = TOKEN } = {}) {
  await menu(page, 'Set up sync…');
  const d = page.getByRole('dialog', { name: 'Sync settings' });
  await d.getByLabel(/Private repo/).fill(repo);
  await d.getByLabel('GitHub token').fill(token);
  await d.getByLabel('This device’s name').fill(deviceName);
  await d.getByRole('button', { name: 'Save and test' }).click();
}

async function sync(page) {
  await menu(page, /^Sync now/);
  await expect(page.getByRole('status')).toContainText(/Synced|Sync failed/);
  return page.getByRole('status').textContent();
}

async function unpackFrom(phone, pc) {
  await phone.getByRole('button', { name: 'Menu' }).click();
  const [download] = await Promise.all([
    phone.waitForEvent('download'),
    phone.getByRole('menuitem', { name: /Pack kit/ }).click(),
  ]);
  await pc.getByRole('button', { name: 'Unpack a kit' }).click();
  await pc.getByLabel('Kit file').setInputFiles(await download.path());
  await pc.getByRole('button', { name: 'Unpack', exact: true }).click();
  await enterSession(pc);
}

test('setup refuses a public repo and a bad token, accepts a good one', async ({ browser }) => {
  const fake = fakeGitHub({ isPrivate: false });
  const pc = await device(browser, fake);
  await start(pc);
  await setUp(pc, 'PC');
  await expect(pc.getByRole('alert')).toContainText('That repo is public');
  fake.state.private = true;
  await pc.getByLabel('GitHub token').fill('wrong');
  await pc.getByRole('button', { name: 'Save and test' }).click();
  await expect(pc.getByRole('alert')).toContainText('rejected the token');
  await pc.getByLabel('GitHub token').fill(TOKEN);
  await pc.getByRole('button', { name: 'Save and test' }).click();
  await expect(pc.getByRole('status')).toContainText('Sync set up');
  await pc.getByRole('button', { name: 'Menu' }).click();
  await expect(pc.getByRole('menuitem', { name: /^Sync now/ })).toBeVisible();
});

test('two devices sync both ways; duplicate stubs combine; online copy is readable', async ({ browser }) => {
  const fake = fakeGitHub();
  const phone = await device(browser, fake);
  await start(phone);
  await say(phone, 'shared start');
  const pc = await device(browser, fake);
  await unpackFrom(phone, pc);

  await setUp(phone, 'Pixel');
  await expect(phone.getByRole('status')).toContainText('Sync set up');
  await setUp(pc, 'PC');
  await expect(pc.getByRole('status')).toContainText('Sync set up');

  await say(phone, 'phone met @Grimbold');
  await say(pc, 'pc paid @grimbold');
  expect(await sync(phone)).toContain('Synced');
  expect(await sync(pc)).toContain('1 duplicate stub combined');
  expect(await sync(phone)).toContain('Synced');

  for (const p of [phone, pc]) {
    await expect(p.locator('.note__text')).toHaveText(['shared start', 'phone met Grimbold', 'pc paid Grimbold']);
    await expect(p.locator('.topbar .badge')).toHaveText('Backed up');
  }
  const ids = async (p) => (await p.evaluate(() => window.__satchel.db.entities.toArray()))
    .filter((e) => !e.deleted && e.name.toLowerCase() === 'grimbold').map((e) => e.id);
  expect(await ids(phone)).toEqual(await ids(pc));
  expect(await ids(pc)).toHaveLength(1);

  const files = await fake.snapshot();
  const bundle = await pc.evaluate(async () => (await window.__satchel.db.meta.get('bundle_id')).value);
  const notes = files[`characters/${bundle}/notes.jsonl`].trim().split('\n').map((l) => JSON.parse(l));
  expect(notes).toHaveLength(3);
  // The phone's last sync found nothing new, so it made no commit: the PC's
  // merge is still the latest online.
  expect(JSON.parse(files[`characters/${bundle}/sync.json`]).device).toBe('PC');
  expect(JSON.stringify(files)).not.toContain(TOKEN);
});

test('syncing with nothing new makes no commit', async ({ browser }) => {
  const fake = fakeGitHub();
  const pc = await device(browser, fake);
  await start(pc);
  await say(pc, 'one');
  await setUp(pc, 'PC');
  await sync(pc);
  const head = fake.state.head;
  expect(await sync(pc)).toContain('already up to date');
  expect(fake.state.head).toBe(head);
});

test('if another device pushes mid-sync, sync retries and keeps both', async ({ browser }) => {
  const fake = fakeGitHub();
  const phone = await device(browser, fake);
  await start(phone);
  await say(phone, 'start');
  const pc = await device(browser, fake);
  await unpackFrom(phone, pc);
  await setUp(phone, 'Pixel');
  await setUp(pc, 'PC');
  await sync(phone);

  await say(phone, 'from phone');
  await say(pc, 'from pc');
  // While the PC is mid-sync, the phone's sync lands first.
  fake.state.beforeMove = async () => {
    fake.state.beforeMove = null;
    await phone.getByRole('button', { name: 'Menu' }).click();
    await phone.getByRole('menuitem', { name: /^Sync now/ }).click();
    await expect(phone.getByRole('status')).toContainText('Synced');
  };
  expect(await sync(pc)).toContain('Synced');
  await expect(pc.locator('.note__text')).toHaveText(['start', 'from phone', 'from pc']);
  await sync(phone);
  await expect(phone.locator('.note__text')).toHaveText(['start', 'from phone', 'from pc']);
});

test('on open, a device is told when the other one has synced', async ({ browser }) => {
  const fake = fakeGitHub();
  const phone = await device(browser, fake);
  await start(phone);
  const pc = await device(browser, fake);
  await unpackFrom(phone, pc);
  await setUp(phone, 'Pixel');
  await setUp(pc, 'PC');
  await sync(pc);
  await sync(phone);

  await say(phone, 'new from phone');
  await sync(phone);
  await pc.reload();
  await expect(pc.getByRole('status')).toContainText('Online copy changed (synced from Pixel');
});

test('offline: sync fails clearly and nothing is lost', async ({ browser }) => {
  const fake = fakeGitHub();
  const pc = await device(browser, fake);
  await start(pc);
  await setUp(pc, 'PC');
  await say(pc, 'keep me');
  fake.state.offline = true;
  expect(await sync(pc)).toContain('Can’t reach GitHub');
  await expect(pc.locator('.note__text')).toHaveText(['keep me']);
  await expect(pc.locator('.topbar .badge')).not.toHaveText('Backed up');
});

test('repo made public after setup: sync stops', async ({ browser }) => {
  const fake = fakeGitHub();
  const pc = await device(browser, fake);
  await start(pc);
  await setUp(pc, 'PC');
  await say(pc, 'secret plans');
  fake.state.private = false;
  expect(await sync(pc)).toContain('now public');
  expect(JSON.stringify(await fake.snapshot())).not.toContain('secret plans');
});

test('ending a session with sync set up offers Sync now, which backs up online', async ({ browser }) => {
  const fake = fakeGitHub();
  const pc = await device(browser, fake);
  await start(pc);
  await setUp(pc, 'PC');
  await expect(pc.getByRole('status')).toContainText('Sync set up');
  await say(pc, 'a note at the table');   // start() left us in session
  await menu(pc, 'End session');
  const nudge = pc.getByRole('dialog', { name: 'Session ended' });
  await expect(nudge).toContainText('Sync now so tonight’s notes are safe online?');
  await nudge.getByRole('button', { name: 'Sync now' }).click();
  await expect(pc.getByRole('status')).toContainText('Synced. Tonight’s notes are backed up online.');
  await expect(pc.locator('.topbar .badge')).toHaveText('Backed up');
  const bundle = await pc.evaluate(async () => (await window.__satchel.db.meta.get('bundle_id')).value);
  expect((await fake.snapshot())[`characters/${bundle}/notes.jsonl`]).toContain('a note at the table');
});

test('the token is never in a packed kit', async ({ browser }) => {
  const fake = fakeGitHub();
  const pc = await device(browser, fake);
  await start(pc);
  await setUp(pc, 'PC');
  await expect(pc.getByRole('status')).toContainText('Sync set up');
  await pc.getByRole('button', { name: 'Menu' }).click();
  const [download] = await Promise.all([
    pc.waitForEvent('download'),
    pc.getByRole('menuitem', { name: /Pack kit/ }).click(),
  ]);
  const { readFile } = await import('node:fs/promises');
  const { unzipSync, strFromU8 } = await import('../../vendor/fflate.mjs');
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  for (const bytes of Object.values(files)) expect(strFromU8(bytes)).not.toContain(TOKEN);
});
