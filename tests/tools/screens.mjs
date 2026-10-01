// Dev tool: fill a character with realistic data and screenshot every page
// at desktop and Pixel width, for a visual review.
//   python -m http.server 8123   (in another terminal)
//   node tests/tools/screens.mjs <output folder>
import { firefox } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'http://localhost:8123/';
const out = process.argv[2] ?? 'screens';
await mkdir(out, { recursive: true });

const browser = await firefox.launch();

async function seed(page) {
  await page.goto(BASE);
  await page.getByLabel('Character name').fill('Kael Stormborn');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('region', { name: 'Inbox' }).waitFor();
  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const notes = [
      'Arrived in Brindol at dusk. Met @Grimbold at the forge, he sells axes.',
      '@Grimbold says the vault under the mill is sealed by @Lord_Aldric.',
      'We owe @Grimbold 20 gp for the repairs.',
      '@Mira_Vane is a fence, works out of the Drowned Rat. Wants the @Sunblade.',
      'The @Thieves_Guild are watching the mill. @Mira_Vane might be one of them.',
      'Found a map of the @Thornwood in the crypt.',
      'Lyra (my sister?) was seen near the @Thornwood.',
      '@Lord_Aldric offered 100 gp to clear the mill. Suspicious.',
    ];
    for (const text of notes) await db.addNote({ text });
    const all = await db.db.entities.toArray();
    const id = (n) => all.find((e) => e.name === n)?.id;
    const pcId = (await db.db.meta.get('pc_entity_id')).value;
    await db.updateEntity(id('Grimbold'), { type: 'npc', tags: ['dwarf', 'smith'], summary: 'Dwarf smith in Brindol; sells axes.', body: 'Gruff but fair. Knows about the vault.' });
    await db.updateEntity(id('Mira Vane'), { type: 'npc', tags: ['fence', 'thieves'], summary: 'Fence at the Drowned Rat.' });
    await db.updateEntity(id('Lord Aldric'), { type: 'npc', tags: ['noble', 'suspicious'], summary: 'Owns the mill; offered 100 gp.' });
    await db.updateEntity(id('Thieves Guild'), { type: 'faction' });
    await db.updateEntity(id('Thornwood'), { type: 'location', summary: 'Old forest north of Brindol.' });
    for (const [section, text] of [
      ['concept', 'Exiled ranger hunting his brother’s killer'],
      ['backstory', 'Raised in the Thornwood by his uncle. Exiled after the fire that killed his brother.'],
      ['personality', 'Quiet, watchful. Dry sense of humour.'],
      ['ideals', 'Freedom. Nobody should be caged.'],
      ['bonds', 'His sister Lyra, missing since the fire.'],
      ['flaws', 'Trusts no one with a title.'],
      ['goals', 'Find who set the fire. Find Lyra.'],
    ]) await db.updateProfile(pcId, section, text);
    await db.addRelationship({ selfId: pcId, otherName: 'Grimbold', type: 'owes', directed: true, notes: '20 gp' });
    await db.addRelationship({ selfId: id('Mira Vane'), otherName: 'Thieves Guild', type: 'member of', directed: true });
    await db.addRelationship({ selfId: pcId, otherName: 'Mira Vane', type: 'ally', directed: false });
    await db.addRelationship({ selfId: id('Lord Aldric'), otherName: 'Grimbold', type: 'rival', directed: false });

    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 500;
    const g = canvas.getContext('2d');
    g.fillStyle = '#E6CFA1'; g.fillRect(0, 0, 800, 500);
    g.fillStyle = '#4A4A4A'; g.font = '48px serif'; g.fillText('Thornwood', 260, 260);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.85));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await db.addFile({ name: 'thornwood-map.webp', kind: 'image', mime: 'image/webp', size: bytes.length, width: 800, height: 500, bytes }, id('Thornwood'));
    const txt = new TextEncoder().encode('# Rumours\n\n- The mill flooded twice.\n- Aldric pays in old coin.');
    await db.addFile({ name: 'rumours.md', kind: 'text', mime: 'text/markdown', size: txt.length, bytes: txt }, null);
  });
  return page.evaluate(async () => {
    const all = await window.__satchel.db.entities.toArray();
    return Object.fromEntries(all.map((e) => [e.name, e.id]));
  });
}

for (const [label, viewport] of [['desktop', { width: 1280, height: 860 }], ['phone', { width: 412, height: 860 }]]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const ids = await seed(page);
  const shots = [
    ['dashboard', '/'], ['character', '/character'], ['inbox', '/inbox'], ['log', '/log'],
    ['list-npc', '/list/npc'], ['entity-grimbold', `/entity/${ids.Grimbold}`],
    ['entity-thornwood', `/entity/${ids.Thornwood}`], ['files', '/files'],
  ];
  for (const [name, path] of shots) {
    await page.goto(`${BASE}#${path}`);
    await page.locator('main').waitFor();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `${label}-${name}.png`), fullPage: true });
  }
  // In session: feed, then a recall card.
  await page.goto(`${BASE}#/`);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Start session' }).click();
  await page.getByLabel('Note').waitFor();
  await page.screenshot({ path: join(out, `${label}-session-feed.png`) });
  await page.getByLabel('Note').pressSequentially('grimbold');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `${label}-session-recall.png`) });
  await page.getByRole('button', { name: 'Kael Stormborn' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `${label}-session-overview.png`) });
  await ctx.close();
}
await browser.close();
console.log('screenshots in', out);
