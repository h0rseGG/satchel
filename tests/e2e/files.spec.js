import { test, expect } from '@playwright/test';
import { enterSession } from './helpers.js';
import { fakeGitHub } from '../fake-github.js';

const URL_BASE = 'http://localhost:8123/';
const box = (page) => page.getByLabel('Note');

async function start(page, name = 'Kael') {
  await page.goto(URL_BASE);
  await page.getByLabel('Character name').fill(name);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('region', { name: 'Inbox' })).toBeVisible();
}

// A real PNG of the given size, drawn in the browser.
async function png(page, width, height, name = 'map.png') {
  const b64 = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#B8D8C0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4A4A4A'; g.fillRect(w / 4, h / 4, w / 2, h / 2);
    return c.toDataURL('image/png').split(',')[1];
  }, [width, height]);
  return { name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}
const textFile = (name, text, mimeType = 'text/plain') => ({ name, mimeType, buffer: Buffer.from(text, 'utf8') });

const liveFiles = (page) => page.evaluate(async () =>
  (await window.__satchel.db.files.toArray()).filter((f) => !f.deleted));
const blobCount = (page) => page.evaluate(() => window.__satchel.db.blobs.count());

test('upload an image: shrunk to 2560 px WebP, thumbnail, viewer, rename, delete', async ({ page }) => {
  await start(page);
  await page.goto(`${URL_BASE}#/files`);
  await page.locator('input[data-picker="Add files…"]').setInputFiles(await png(page, 3000, 1000));
  await expect(page.getByRole('status')).toContainText('Added map.png');
  const [f] = await liveFiles(page);
  expect([f.kind, f.mime, f.width, f.height]).toEqual(['image', 'image/webp', 2560, 853]);
  expect(f.size).toBeGreaterThan(0);

  await page.locator('.thumb').click();
  const viewer = page.getByRole('dialog', { name: 'map.png' });
  await expect(viewer.locator('.viewer__img')).toBeVisible();
  await expect(viewer).toContainText('2560×853');
  await viewer.getByLabel('Name').fill('Thornwood map.png');
  await viewer.getByLabel('Name').blur();
  await expect(page.getByRole('dialog', { name: 'Thornwood map.png' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('dialog', { name: /^Delete/ }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.thumb')).toHaveCount(0);
  expect(await liveFiles(page)).toHaveLength(0);
  expect(await blobCount(page)).toBe(0);
});

test('text files: .md and .txt are stored and shown as plain text', async ({ page }) => {
  await start(page);
  await page.goto(`${URL_BASE}#/files`);
  await page.locator('input[data-picker="Add files…"]').setInputFiles([
    textFile('lore.md', '# The Thornwood\n\n**Old** forest.', 'text/markdown'),
    textFile('loot.txt', 'rope\nlantern'),
  ]);
  await expect(page.getByRole('status')).toContainText('Added 2 files');
  await page.locator('.thumb', { hasText: 'lore.md' }).click();
  await expect(page.locator('.viewer__text')).toHaveText('# The Thornwood\n\n**Old** forest.');
  const files = await liveFiles(page);
  expect(files.map((x) => x.mime).sort()).toEqual(['text/markdown', 'text/plain']);
});

test('refused: PDFs, binary pretending to be text, and anything over 10 MB', async ({ page }) => {
  await start(page);
  await page.goto(`${URL_BASE}#/files`);
  await page.locator('input[data-picker="Add files…"]').setInputFiles({ name: 'rules.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(page.getByRole('status')).toContainText('only images, .txt and .md');
  await page.locator('input[data-picker="Add files…"]').setInputFiles({ name: 'fake.txt', mimeType: 'text/plain', buffer: Buffer.from([0xff, 0xfe, 0x00, 0xd8, 0xff]) });
  await expect(page.getByRole('status')).toContainText('doesn\'t look like a text file');
  await page.locator('input[data-picker="Add files…"]').setInputFiles(textFile('huge.txt', 'x'.repeat(10 * 1024 * 1024 + 1)));
  await expect(page.getByRole('status')).toContainText('the limit is 10.0 MB');
  await page.locator('input[data-picker="Add files…"]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a png') });
  await expect(page.getByRole('status')).toContainText('Can’t read broken.png as an image');
  expect(await liveFiles(page)).toHaveLength(0);
});

test('files on an entity page; attach from the viewer; use as picture', async ({ page }) => {
  await start(page);
  await box(page).pressSequentially('met @Grimbold');
  await box(page).press('Enter');
  const g = await page.evaluate(async () => (await window.__satchel.db.entities.toArray()).find((e) => e.name === 'Grimbold'));
  await page.goto(`${URL_BASE}#/entity/${g.id}`);
  await page.locator('input[data-picker="Add files…"]').setInputFiles(await png(page, 200, 300, 'grimbold.png'));
  await expect(page.locator('.thumb')).toHaveCount(1);
  await page.locator('.thumb').click();
  await page.getByRole('button', { name: 'Use as picture' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grimbold');
  await expect(page.locator('.portrait--entity')).toBeVisible();

  // An unattached file can be attached from the viewer.
  await page.goto(`${URL_BASE}#/files`);
  await page.locator('input[data-picker="Add files…"]').setInputFiles(textFile('debts.txt', '20 gp'));
  await page.locator('.thumb', { hasText: 'debts.txt' }).click();
  await page.getByLabel('Attached to').selectOption({ label: 'Grimbold · Stub' });
  await page.getByRole('link', { name: 'Open Grimbold →' }).click();
  await expect(page.locator('.thumb')).toHaveCount(2);
});

test('portrait: set on the character page, shown on the dashboard and in the overview', async ({ page }) => {
  await start(page);
  await page.goto(`${URL_BASE}#/character`);
  await page.locator('input[data-picker="Set portrait…"]').setInputFiles(await png(page, 400, 600, 'kael.png'));
  await expect(page.locator('.character__portrait .portrait')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change portrait…' })).toBeVisible();
  await page.goto(`${URL_BASE}#/`);
  await expect(page.locator('.portrait--small')).toBeVisible();
  await enterSession(page);
  await page.getByRole('button', { name: 'Kael' }).click();
  await expect(page.locator('.portrait--overview')).toBeVisible();
});

test('kit round trip carries files to another device', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await start(a);
  await a.goto(`${URL_BASE}#/files`);
  await a.locator('input[data-picker="Add files…"]').setInputFiles([await png(a, 300, 200), textFile('lore.md', '# Lore')]);
  await expect(a.locator('.thumb')).toHaveCount(2);
  const aBytes = await a.evaluate(async () => {
    const out = {};
    for (const b of await window.__satchel.db.blobs.toArray()) out[b.id] = [...new Uint8Array(await b.data.arrayBuffer())].length;
    return out;
  });
  await a.getByRole('button', { name: 'Menu' }).click();
  const [download] = await Promise.all([a.waitForEvent('download'), a.getByRole('menuitem', { name: /Pack kit/ }).click()]);

  const b = await (await browser.newContext()).newPage();
  await b.goto(URL_BASE);
  await b.getByRole('button', { name: 'Unpack a kit' }).click();
  await b.getByLabel('Kit file').setInputFiles(await download.path());
  await b.getByRole('button', { name: 'Unpack', exact: true }).click();
  await b.goto(`${URL_BASE}#/files`);
  await expect(b.locator('.thumb')).toHaveCount(2);
  const bBytes = await b.evaluate(async () => {
    const out = {};
    for (const x of await window.__satchel.db.blobs.toArray()) out[x.id] = [...new Uint8Array(await x.data.arrayBuffer())].length;
    return out;
  });
  expect(bBytes).toEqual(aBytes);
  await b.locator('.thumb', { hasText: 'lore.md' }).click();
  await expect(b.locator('.viewer__text')).toHaveText('# Lore');
});

test('sync carries files, deletions too; known files are not downloaded again', async ({ browser }) => {
  const fake = fakeGitHub();
  const device = async () => {
    const ctx = await browser.newContext();
    await ctx.route('https://api.github.com/**', async (route) => {
      const r = route.request();
      const { status, json } = await fake.handle(r.method(), r.url(), r.postData(), await r.allHeaders());
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
    });
    return ctx.newPage();
  };
  const setUp = async (p, name) => {
    await p.getByRole('button', { name: 'Menu' }).click();
    await p.getByRole('menuitem', { name: 'Set up sync…' }).click();
    await p.getByLabel(/Private repo/).fill('h0rseGG/satchel-data');
    await p.getByLabel('GitHub token').fill('good-token');
    await p.getByLabel('This device’s name').fill(name);
    await p.getByRole('button', { name: 'Save and test' }).click();
    await expect(p.getByRole('status')).toContainText('Sync set up');
  };
  const sync = async (p) => {
    await p.getByRole('button', { name: 'Menu' }).click();
    await p.getByRole('menuitem', { name: /^Sync now/ }).click();
    await expect(p.getByRole('status')).toContainText('Synced');
  };

  const a = await device();
  await start(a);
  await setUp(a, 'PC');
  await a.goto(`${URL_BASE}#/files`);
  await a.locator('input[data-picker="Add files…"]').setInputFiles(await png(a, 300, 200));
  await expect(a.locator('.thumb')).toHaveCount(1);
  await sync(a);
  const bundle = await a.evaluate(async () => (await window.__satchel.db.meta.get('bundle_id')).value);
  expect(Object.keys(await fake.snapshot()).some((p) => p.startsWith(`characters/${bundle}/files/`) && p.endsWith('.webp'))).toBe(true);

  // Second device: start from a kit, then sync to pick up the file.
  await a.getByRole('button', { name: 'Menu' }).click();
  const [download] = await Promise.all([a.waitForEvent('download'), a.getByRole('menuitem', { name: /Pack kit/ }).click()]);
  const b = await device();
  await b.goto(URL_BASE);
  await b.getByRole('button', { name: 'Unpack a kit' }).click();
  await b.getByLabel('Kit file').setInputFiles(await download.path());
  await b.getByRole('button', { name: 'Unpack', exact: true }).click();
  await setUp(b, 'Pixel');
  fake.state.calls.length = 0;
  await sync(b);
  // character.json and notes.jsonl are read; the image B already has is not.
  expect(fake.state.calls.filter((c) => c.startsWith('GET /git/blobs')).length, 'file bytes already on B are not downloaded').toBe(2);

  // Delete on A, sync both: gone on B, bytes freed.
  await a.locator('.thumb').click();
  await a.getByRole('button', { name: 'Delete…' }).click();
  await a.getByRole('dialog', { name: /^Delete/ }).getByRole('button', { name: 'Delete' }).click();
  await sync(a);
  await sync(b);
  await b.goto(`${URL_BASE}#/files`);
  await expect(b.locator('.thumb')).toHaveCount(0);
  expect(await blobCount(b)).toBe(0);
});
