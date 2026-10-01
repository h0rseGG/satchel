import { test, expect } from '@playwright/test';

// A database left by build step 4 (local db v1): notes with plain "@Name"
// text and no links. Opening the current app must link them (db v2 upgrade).
test('v1 -> v2: old typed @mentions get linked', async ({ page }) => {
  await page.goto('/tests/e2e/blank.html');
  await page.evaluate(async () => {
    const { default: Dexie } = await import('/vendor/dexie.mjs');
    const old = new Dexie('satchel');
    old.version(1).stores({
      entities: 'id, type, updated_at',
      notes: 'id, created_at, session_id, *mentions',
      sessions: 'id, number',
      relationships: 'id, from_id, to_id',
      images: 'id, entity_id',
      blobs: 'id',
      meta: 'key',
    });
    const t = '2026-09-30T10:00:00.000Z';
    const base = { created_at: t, updated_at: t, deleted: false };
    const pcId = '00000000-0000-4000-8000-000000000001';
    await old.entities.add({
      ...base, id: pcId, type: 'character', name: 'Kael', aliases: [], summary: '', body: '',
      stub: false, image_ids: [], merged_into: null,
    });
    await old.meta.bulkPut([
      { key: 'bundle_id', value: '00000000-0000-4000-8000-0000000000b1' },
      { key: 'pc_entity_id', value: pcId },
    ]);
    const note = (id, text) => ({
      ...base, id, text, original_text: null, mode: 'out', session_id: null,
      mentions: [], triaged_at: null, promoted_to: [],
    });
    await old.notes.bulkAdd([
      note('00000000-0000-4000-8000-0000000000a1', 'found the @Sunblade in a crypt'),
      note('00000000-0000-4000-8000-0000000000a2', '@sunblade glows near undead, @Kael is pleased'),
      note('00000000-0000-4000-8000-0000000000a3', 'no mentions here'),
    ]);
    old.close();
  });

  await page.goto('/');
  await expect(page.locator('.note .mention')).toHaveText(['Sunblade', 'Sunblade', 'Kael']);

  const { ents, notes } = await page.evaluate(async () => ({
    ents: await window.__satchel.db.entities.toArray(),
    notes: await window.__satchel.db.notes.orderBy('id').toArray(),
  }));
  const blades = ents.filter((e) => e.name.toLowerCase() === 'sunblade');
  expect(blades).toHaveLength(1);
  expect(blades[0].stub).toBe(true);
  expect(notes[0].mentions).toEqual([blades[0].id]);
  expect(notes[1].mentions).toEqual([blades[0].id, '00000000-0000-4000-8000-000000000001']);
  expect(notes[0].updated_at > notes[0].created_at).toBe(true);
  expect(notes[2].updated_at).toBe(notes[2].created_at);
  expect(notes[2].text).toBe('no mentions here');

  // v3: every entity has a tags list; the PC (created before tags) wasn't
  // marked as changed by the upgrade.
  for (const e of ents) expect(e.tags).toEqual([]);
  const pc = ents.find((e) => e.name === 'Kael');
  expect(pc.updated_at).toBe('2026-09-30T10:00:00.000Z');
});
