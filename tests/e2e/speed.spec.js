// Speed at 5000 notes (SPEC 10): capture save < 100 ms, search < 50 ms, no visible lag
// typing. Measured in the page with the app's own modules and data.
import { test, expect } from '@playwright/test';
import { newCharacter } from './helpers.js';

test('5000 notes: save, search, keystroke work and catch-up after a save stay fast @speed', async ({ page }) => {
  test.setTimeout(240000);
  await newCharacter(page, 'Wren Ashdown');
  await page.evaluate(async () => {
    const d = window.__satchel.data;
    const ents = [];
    for (let i = 0; i < 300; i++) ents.push(await d.createEntity({ name: `Person ${i} ${['Ironhand', 'Vane', 'Thorne', 'Ashdown'][i % 4]}${i}`, type_id: 'type-npc', aliases: [`P${i}`] }));
    const words = 'goblin mill river lord debt cargo hollow king sister wren lyra ship storm brimstone ledger jetty moon'.split(' ');
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    const notes = Array.from({ length: 5000 }, (_, i) => {
      const e = ents[i % ents.length];
      const at = new Date(t0 + i * 60000).toISOString();
      return { id: crypto.randomUUID(), created_at: at, updated_at: at, deleted: false, text: `@[${e.name}](${e.id}) ${Array.from({ length: 14 }, (_, j) => words[(i * 7 + j * 3) % words.length]).join(' ')} #tag${i % 30}`, mentions: [e.id], tags: [`tag${i % 30}`], mode: 'in', triaged_at: at, promoted_to: [], original_text: null };
    });
    await window.__satchel.db.notes.bulkPut(notes);
  });
  await page.reload();
  await page.waitForFunction(() => window.__satchel?.data);

  const r = await page.evaluate(async () => {
    const { subscribeCapture } = await import('/js/data/captureStore.js');
    const s = await import('/js/core/search.js');
    const m = await import('/js/core/mentions.js');
    const t = await import('/js/core/tags.js');
    let cap;
    const t0 = performance.now();
    await new Promise((res) => subscribeCapture((c) => { cap = c; if (c.notesReady) res(); }));
    const startup = performance.now() - t0;
    const time = (fn, n = 20) => { const a = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - a) / n; };
    const text = 'paid person 12 ironhand12 back and p40 said vane1 about the @pers';
    // What one keystroke costs: token, suggestions, tag suggestions, recall, search.
    const keystroke = time(() => {
      m.activeToken(text, text.length);
      m.suggestEntities('pers', cap.entities, 5);
      t.suggestTags('ta', cap.tags, 5);
      m.namedEntities(text, cap.nameIndex, { limit: 3 });
      s.search(cap.searchIndex, 'storm ship');
    });
    const search = time(() => { for (const q of ['brim', 'hollow king', 'ledgr', 'storm ship']) s.search(cap.searchIndex, q); }, 5) / 4;
    // A save, and how long until the capture store has caught up with it.
    const a = performance.now();
    const caught = new Promise((res) => subscribeCapture((c) => { if (s.search(c.searchIndex, 'zebrafinch').length) res(performance.now()); }));
    await window.__satchel.data.addNote('zebrafinch @Person_1_Vane1', { index: cap.nameIndex });
    const save = performance.now() - a;
    const catchUp = (await caught) - a;
    return { startup, keystroke, search, save, catchUp };
  });
  console.log('speed (ms):', JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)]))));
  // Real typing in the session box: time per key, including rendering suggestions,
  // recall cards and search results. Includes Playwright's own overhead per key.
  await page.locator('.session-btn').click();
  const box = page.getByRole('combobox', { name: 'Note' });
  await expect(box).toBeFocused();
  const sentence = 'paid person 12 ironhand12 back, p40 said @pers';
  const t0 = Date.now();
  await box.pressSequentially(sentence);
  await expect(box).toHaveValue(sentence);
  await expect(page.locator('.recall-card').first()).toBeVisible();
  const perKey = (Date.now() - t0) / sentence.length;
  console.log('typing (ms per key, incl. Playwright):', Math.round(perKey));
  expect(perKey).toBeLessThan(50);

  expect(r.save).toBeLessThan(100);
  expect(r.search).toBeLessThan(50);
  expect(r.keystroke).toBeLessThan(16);
  expect(r.catchUp).toBeLessThan(250);
});
