// Builds demo/wren.kit: a realistic test character for trying every
// feature. Offered on the first-run screen ("Try the demo character") and
// used by tests/e2e/demo.spec.js.
//   node tests/tools/make-demo-kit.mjs
// Uses the app's own record factories, mention tokens and kit packer, so the
// result is a genuine kit. Images are drawn in Playwright's Firefox (canvas)
// and saved as WebP, exactly like an upload.
import { writeFile } from 'node:fs/promises';
import { firefox } from '@playwright/test';
import { makeEntity, makeNote, makeRelationship, makeFile, touch } from '../../js/model.js';
import { token, storedIds } from '../../js/mentions.js';
import { packKit } from '../../js/kit.js';

// Fixed bundle id: regenerating gives the same character, so a newer demo
// kit merges into an older one instead of counting as a different character.
const BUNDLE = 'de300000-0000-4000-8000-0000000000a1';

// Times: sessions on Fridays 19:00–23:30 in Perth (UTC+8).
const perth = (day, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 8, day, h - 8, m)).toISOString();
};
const stamp = (rec, at, extra = {}) => ({ ...rec, created_at: at, updated_at: at, ...extra });

// ---------- Entities ----------
const T0 = perth(1, '12:00');
const ents = {};
function ent(name, type, { summary = '', body = '', tags = [], aliases = [], stub } = {}) {
  ents[name] = stamp(makeEntity({ name, type, summary, body, tags, aliases, ...(stub !== undefined ? { stub } : {}) }), T0);
  return ents[name];
}

const wren = ent('Wren Ashdown', 'character');
ent('Grimbold Ironhand', 'npc', {
  summary: 'Dwarf smith in Brindol; sells axes, knows the old vault.',
  body: 'Gruff but fair. Fought in the Goblin War with Captain Hask.\n\nKeeps a ledger of everyone who owes him, and we’re in it.',
  tags: ['dwarf', 'smith', 'Brindol'], aliases: ['Grim'],
});
ent('Mira Vane', 'npc', {
  summary: 'Fence at the Drowned Rat. Wants the Sunblade.',
  body: 'Silver-haired, always smiling. Claims to have known our mother.',
  tags: ['fence', 'the Knives'],
});
ent('Lord Aldric Thorne', 'npc', {
  summary: 'Owns the Old Mill. Offered 100 gp to clear it. Lying about something.',
  tags: ['noble', 'suspicious'], aliases: ['Aldric', 'Lord Thorne'],
});
ent('Sister Caldra', 'npc', { summary: 'Priestess of the Pale Lantern. Healed Tam for free.', tags: ['cleric', 'ally'] });
ent('Old Tam', 'npc', { summary: 'Ferryman on the Elsir. Sees everything that crosses the river.', tags: ['ferryman', 'informant'] });
ent('Lyra Ashdown', 'npc', { summary: 'Wren’s sister. Missing since the fire.', tags: ['family', 'missing'] });
ent('Captain Hask', 'npc', { summary: 'Captain of the Brindol Watch. Tired, honest, outnumbered.', tags: ['watch'] });
ent('Pip', 'npc', { summary: 'Street kid. Runs messages for a copper.', tags: ['informant', 'kid'] });
ent('The Knives', 'faction', { summary: 'Brindol’s thieves’ guild.', tags: ['criminal'], aliases: ['Thieves Guild'] });
ent('Order of the Pale Lantern', 'faction', { summary: 'Healers who hunt the undead.', aliases: ['Pale Lantern'] });
ent('Brindol Watch', 'faction', { summary: 'The town guard. Twelve people for a town of four thousand.' });
ent('Brindol', 'location', { summary: 'River town, two days south of the Thornwood.', tags: ['town'] });
ent('Thornwood', 'location', { summary: 'Old forest where Wren grew up. Burned in the fire.', tags: ['forest', 'home'] });
ent('The Drowned Rat', 'location', { summary: 'Dockside tavern; the Knives drink here.', tags: ['tavern'] });
ent('Old Mill', 'location', { summary: 'Aldric’s mill. Something lives under it.', tags: ['dungeon'] });
ent('Saltmarsh Crypt', 'location', { summary: 'Flooded crypt east of town. Found the map here.' });
ent('Sunblade', 'item', { summary: 'Longsword that glows near undead. Ours, for now.', tags: ['magic', 'weapon'] });
ent('Aldric’s signet ring', 'item', { summary: 'Found in the mill cellar. Why was it there?', tags: ['evidence'] });
// Rough edges to tidy up: plain stubs, and a typo duplicate of Grimbold.
ent('the Grey Man', 'unknown');
ent('Hollow King', 'unknown');
ent('Grimbolt', 'unknown');

const T = (name) => ents[name];

// ---------- Notes ----------
// {Name} becomes a mention of that entity.
const notes = [];
function note(at, mode, text, { triaged = null, original = null } = {}) {
  const stored = text.replace(/\{([^}]+)\}/g, (_, n) => {
    if (!ents[n]) throw new Error(`Unknown entity in note: ${n}`);
    return token(ents[n]);
  });
  const n = stamp(makeNote({ text: stored, mode, mentions: storedIds(stored) }), at, {
    triaged_at: triaged,
    original_text: original,
  });
  notes.push(n);
  return n;
}
const sorted = perth(26, '10:00');   // tidied the weekend before last

// Session 1 — 5 Sep
note(perth(5, '19:12'), 'in', 'Arrived in {Brindol} at dusk. Rain. The river gate is shut after dark.', { triaged: sorted });
note(perth(5, '19:30'), 'in', 'Met {Grimbold Ironhand} at the forge. He sells axes and asks too many questions.', { triaged: sorted });
note(perth(5, '19:51'), 'in', '{Grimbold Ironhand} says the vault under the {Old Mill} has been sealed since the Goblin War.', { triaged: sorted });
note(perth(5, '20:20'), 'in', 'Ate at {The Drowned Rat}. Watched by two people with knife tattoos on their wrists.', { triaged: sorted });
note(perth(5, '20:44'), 'in', '{Mira Vane} sat with us uninvited. Asked whether we had ever heard of a sword that glows.', { triaged: sorted });
note(perth(5, '21:15'), 'in', 'Knife tattoos = {The Knives}. Mira is one of them, or near enough.', { triaged: sorted });
note(perth(5, '21:40'), 'in', 'Hired by {Lord Aldric Thorne} to clear the {Old Mill}: 100 gp, half up front.', { triaged: sorted });
note(perth(5, '22:05'), 'in', 'Aldric didn’t want us going below the first cellar. Odd.', { triaged: sorted });
note(perth(5, '22:50'), 'in', 'Rats the size of dogs in the mill. Burned the nest. Rogue took a bite.', { triaged: sorted });
note(perth(5, '23:20'), 'in', 'Found {Aldric’s signet ring} in the lower cellar, under silt. He said nobody goes down there.', { triaged: sorted });

// Between sessions
note(perth(8, '07:45'), 'out', 'Thinking: who would Wren trust here? Nobody with a title. Maybe the ferryman.', { triaged: sorted });
note(perth(10, '21:00'), 'out', 'Backstory idea: Lyra had a scar on her left palm from the same fire.', { triaged: sorted });

// Session 2 — 12 Sep
note(perth(12, '19:05'), 'in', 'Recap: we kept the ring. Haven’t told {Lord Aldric Thorne}.', { triaged: sorted });
note(perth(12, '19:25'), 'in', '{Old Tam} ferried us across the Elsir. Says a grey man crossed three nights running, always after midnight.', { triaged: sorted });
note(perth(12, '19:40'), 'in', '{Old Tam} won’t take coin from Wren. "Your mother paid me forward."', { triaged: sorted });
note(perth(12, '20:10'), 'in', '{Saltmarsh Crypt}: flooded to the knees. Skeletons that don’t stay down.', { triaged: sorted });
note(perth(12, '20:35'), 'in', 'Found the {Sunblade} in a drowned knight’s grip. Glows near the dead.', { triaged: sorted });
note(perth(12, '21:00'), 'in', 'Also found a map of the {Thornwood} with the old ranger paths marked. Someone has been there recently.', { triaged: sorted });
note(perth(12, '21:30'), 'in', 'Tam came down with crypt-rot. {Sister Caldra} healed him, no charge.', { triaged: sorted });
note(perth(12, '22:00'), 'in', '{Sister Caldra} is with the {Order of the Pale Lantern}. They’ve been tracking undead in the marsh for a year.', { triaged: sorted });
note(perth(12, '22:40'), 'in', 'We owe {Grimbold Ironhand} 20 gp for the shield repairs. He wrote it in his ledger in front of us.', { triaged: sorted });
note(perth(12, '23:10'), 'in', '{Mira Vane} offered 300 gp for the {Sunblade}. Said no. She smiled like she expected that.', { triaged: sorted });

// Between sessions
note(perth(15, '12:30'), 'out', 'Question for the DM: does the Pale Lantern know about the Grey Man?', { triaged: sorted });
note(perth(17, '20:15'), 'out', 'Wren’s goal is shifting: less revenge, more find Lyra first.', { triaged: sorted });

// Session 3 — 19 Sep
note(perth(19, '19:10'), 'in', '{Captain Hask} pulled us aside. Three people missing from the docks this month. Watch can’t spare anyone.', { triaged: sorted });
note(perth(19, '19:30'), 'in', '{Captain Hask} and {Grimbold Ironhand} served together in the Goblin War.', { triaged: sorted });
note(perth(19, '19:55'), 'in', '{Pip} saw the missing people go into {The Drowned Rat}. None came out the front.', { triaged: sorted });
note(perth(19, '20:20'), 'in', 'Paid {Pip} 5 cp. Promised more for news of {the Grey Man}.', { triaged: sorted });
note(perth(19, '20:45'), 'in', 'Cellar of the Rat has a tunnel. Smells like the mill cellar did.', { triaged: sorted });
note(perth(19, '21:10'), 'in', 'Tunnel connects the Rat to the {Old Mill}. Aldric must know.', { triaged: sorted });
note(perth(19, '21:40'), 'in', 'Fought {The Knives} in the tunnel. {Mira Vane} wasn’t with them, but they knew our names.', { triaged: sorted });
note(perth(19, '22:15'), 'in', 'Captured one. He says they move "cargo" for a buyer they call the Hollow King.', { triaged: sorted });
note(perth(19, '22:50'), 'in', 'The cargo is people. Handed the prisoner to {Captain Hask}.', { triaged: sorted });
note(perth(19, '23:25'), 'in', 'Hask thanked us, then told us to leave town for a week. For our own safety, he said.', { triaged: sorted });

// Between sessions (unsorted from here on: these are in the inbox)
note(perth(22, '18:00'), 'out', 'Wren doesn’t trust {Captain Hask} telling us to leave. Who is he protecting?');
note(perth(24, '07:10'), 'out', 'If the {Hollow King} is buying people, {Lord Aldric Thorne} is selling them.');

// Session 4 — 26 Sep
note(perth(26, '19:08'), 'in', 'Didn’t leave town. Hid at {Old Tam}’s hut across the river.');
note(perth(26, '19:30'), 'in', '{Pip} came at dawn: {the Grey Man} visits {Lord Aldric Thorne} every second night.');
note(perth(26, '19:55'), 'in', 'Showed {Aldric’s signet ring} to {Sister Caldra}. She went pale. The crest is the {Hollow King}’s.');
note(perth(26, '20:20'), 'in', '{Order of the Pale Lantern} will help if we bring proof. They want the {Sunblade} used against whatever is in the mill.');
note(perth(26, '20:45'), 'in', '{Mira Vane} found us at the hut. Says she knew our mother, and that {Lyra Ashdown} is alive.');
note(perth(26, '21:10'), 'in', 'Mira wants the {Sunblade} in exchange for where Lyra is. Didn’t answer.');
note(perth(26, '21:40'), 'in', 'Paid {Grimbolt} back the 20 gp. Ledger squared.', { original: 'Paid Grimbolt back the 20gp.' });
note(perth(26, '22:15'), 'in', 'Plan for next time: into the mill vault at night, with the Lantern’s help. Leave the sword with nobody.');
note(perth(26, '23:00'), 'in', 'DM hinted the {Thornwood} fire wasn’t an accident.');

// ---------- Character page ----------
const profile = {
  concept: 'Exiled ranger looking for her missing sister',
  backstory: 'Raised in the Thornwood by her mother, a ranger of the old paths. When Wren was sixteen the forest burned. Her mother died; her sister Lyra was never found.\n\nThe Thornwood council blamed Wren, who had been on watch, and exiled her.',
  personality: 'Quiet, watchful, dry. Talks to animals more easily than people.',
  ideals: 'Freedom. Nobody should be caged.',
  bonds: 'Lyra, alive or dead. Old Tam, who knew her mother.',
  flaws: 'Trusts no one with a title. Holds grudges for years.',
  goals: 'Find Lyra. Then find out who set the fire.',
  appearance: 'Tall, sun-browned, a burn scar along the left forearm. Green cloak, much mended.',
  notes: 'Speaks Elvish and Sylvan. Favourite food: river trout.',
};
const pcEdited = perth(26, '10:05');
ents['Wren Ashdown'] = {
  ...ents['Wren Ashdown'],
  profile,
  profile_times: Object.fromEntries(Object.keys(profile).map((k) => [k, pcEdited])),
  updated_at: pcEdited,
};

// ---------- Relationships ----------
const rels = [];
function rel(from, type, to, directed, notesText = '') {
  rels.push(stamp(makeRelationship({ from_id: T(from).id, to_id: T(to).id, type, directed, notes: notesText }), sorted));
}
rel('Wren Ashdown', 'owes', 'Grimbold Ironhand', true, '20 gp, shield repairs (paid back session 4)');
rel('Wren Ashdown', 'family', 'Lyra Ashdown', false, 'Sister');
rel('Wren Ashdown', 'ally', 'Old Tam', false);
rel('Wren Ashdown', 'ally', 'Sister Caldra', false);
rel('Wren Ashdown', 'rival', 'Mira Vane', false, 'Wants the Sunblade');
rel('Wren Ashdown', 'raised in', 'Thornwood', true);
rel('Mira Vane', 'member of', 'The Knives', true);
rel('Sister Caldra', 'member of', 'Order of the Pale Lantern', true);
rel('Captain Hask', 'member of', 'Brindol Watch', true);
rel('Captain Hask', 'ally', 'Grimbold Ironhand', false, 'Goblin War');
rel('Lord Aldric Thorne', 'works for', 'Hollow King', true, 'Suspected');
rel('The Knives', 'located in', 'The Drowned Rat', true);
rel('Old Mill', 'located in', 'Brindol', true);
rel('Pip', 'works for', 'Wren Ashdown', true, '5 cp a message');

// ---------- Files (drawn in a real browser, saved as WebP) ----------
async function drawImages() {
  const browser = await firefox.launch();
  const page = await browser.newPage();
  const draw = async (fn, w, h) => {
    const b64 = await page.evaluate(async ([src, w, h]) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      new Function('g', 'w', 'h', src)(c.getContext('2d'), w, h);
      const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.85));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (const x of bytes) s += String.fromCharCode(x);
      return btoa(s);
    }, [fn, w, h]);
    return new Uint8Array(Buffer.from(b64, 'base64'));
  };
  // Portrait: a hooded figure against a forest.
  const portrait = await draw(`
    g.fillStyle = '#B8D8C0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8A8A8A';
    for (let i = 0; i < 7; i++) { const x = 30 + i * 70; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 35, 120 + (i % 3) * 40); g.lineTo(x + 70, h); g.fill(); }
    g.fillStyle = '#4A4A4A';
    g.beginPath(); g.arc(w / 2, 230, 70, Math.PI, 0); g.lineTo(w / 2 + 110, h); g.lineTo(w / 2 - 110, h); g.closePath(); g.fill();
    g.fillStyle = '#E6CFA1'; g.beginPath(); g.ellipse(w / 2, 250, 38, 48, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4A4A4A'; g.beginPath(); g.arc(w / 2, 225, 72, Math.PI * 1.05, Math.PI * 1.95); g.lineWidth = 18; g.strokeStyle = '#4A4A4A'; g.stroke();
  `, 480, 600);
  // Map: river, town, forest, mill, crypt.
  const map = await draw(`
    g.fillStyle = '#E6CFA1'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8A8A8A'; g.lineWidth = 18; g.beginPath(); g.moveTo(0, 380); g.bezierCurveTo(300, 300, 500, 520, w, 420); g.stroke();
    g.fillStyle = '#B8D8C0'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(80 + (i * 37) % 420, 60 + (i * 53) % 180, 22, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#4A4A4A'; g.font = '28px serif';
    g.fillText('Thornwood', 170, 150); g.fillText('Brindol', 560, 330); g.fillText('Old Mill', 420, 470); g.fillText('Saltmarsh Crypt', 640, 560);
    g.fillRect(600, 340, 40, 30); g.fillRect(450, 480, 24, 24);
    g.strokeStyle = '#4A4A4A'; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(250, 170); g.lineTo(600, 340); g.stroke();
  `, 900, 620);
  await browser.close();
  return { portrait, map };
}

const { portrait, map } = await drawImages();
const enc = (s) => new TextEncoder().encode(s);
const handout = enc(`# Letter found on the Knives' prisoner

The cargo moves on the new moon. The usual door under the mill.
Payment as before, to the Grey Man. He speaks for the King.

Burn this.
`);
const loot = enc(`Loot, session 2
- Sunblade (longsword, glows near undead)
- 34 gp, 12 sp
- Map of the Thornwood
- Waterlogged prayer book (Pale Lantern?)
`);

const files = [];
const fileBytes = new Map();
function addFile(name, kind, mime, bytes, entityName, at, dims = {}) {
  const f = stamp(makeFile({ name, kind, mime, size: bytes.length, entity_id: entityName ? T(entityName).id : null, ...dims }), at);
  files.push(f);
  fileBytes.set(f.id, bytes);
  return f;
}
const pf = addFile('wren-portrait.webp', 'image', 'image/webp', portrait, 'Wren Ashdown', sorted, { width: 480, height: 600 });
addFile('thornwood-map.webp', 'image', 'image/webp', map, 'Thornwood', perth(12, '21:05'), { width: 900, height: 620 });
addFile('knives-letter.md', 'text', 'text/markdown', handout, 'The Knives', perth(19, '22:20'));
addFile('loot-session-2.txt', 'text', 'text/plain', loot, null, perth(12, '23:30'));
ents['Wren Ashdown'] = { ...ents['Wren Ashdown'], portrait_file_id: pf.id };

// ---------- Pack ----------
const data = {
  bundle_id: BUNDLE,
  pc_entity_id: wren.id,
  entities: Object.values(ents),
  notes,
  sessions: [],
  relationships: rels,
  files,
  fileBytes,
};
const bytes = packKit(data, perth(30, '09:00'));
await writeFile(new URL('../../demo/wren.kit', import.meta.url), bytes);
console.log(`demo/wren.kit: ${Object.keys(ents).length} entities, ${notes.length} notes, ${rels.length} relationships, ${files.length} files, ${(bytes.length / 1024).toFixed(0)} KB`);
console.log(`inbox: ${notes.filter((n) => !n.triaged_at).length} unsorted notes`);
