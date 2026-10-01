// Builds demo/wren.kit: the Satchel test character. It's meant to read like a
// real player's notes (shorthand, typos, swearing, table chatter) because
// that's what the app has to cope with, and every feature has something in
// it to poke at. Offered on the first-run screen ("Try the demo character")
// and checked by tests/e2e/demo.spec.js.
//   node tests/tools/make-demo-kit.mjs
//
// Notes are written as typed (@Name, @Two_Words, @alias, @typo) and run
// through the app's own mention resolver, so building the demo exercises the
// parser and creates stubs the same way the app does. Images are drawn in
// Playwright's Firefox and saved as WebP, like an upload. IDs are derived
// from fixed keys, so a rebuilt demo merges cleanly into an older one.
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { firefox } from '@playwright/test';
import { makeEntity, makeNote, makeRelationship, makeFile } from '../../js/model.js';
import { resolveMentions } from '../../js/mentions.js';
import { packKit } from '../../js/kit.js';

const BUNDLE = 'de300000-0000-4000-8000-0000000000a1';

// Stable UUID-shaped id from a key.
function did(key) {
  const h = createHash('sha1').update(`satchel-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Sessions: Fridays from 19:00, Perth time (UTC+8).
const perth = (day, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 8, day, h - 8, m)).toISOString();
};
const stamp = (rec, at, id, extra = {}) => ({ ...rec, id, created_at: at, updated_at: at, ...extra });

// ---------- People, places, things ----------
const T0 = perth(1, '12:00');
const ents = {};
function ent(name, type, { summary = '', body = '', tags = [], aliases = [] } = {}) {
  ents[name] = stamp(makeEntity({ name, type, summary, body, tags, aliases }), T0, did(`ent:${name}`));
  return ents[name];
}

const wren = ent('Wren Ashdown', 'character');
// The rest of the party (other players' characters).
ent('Bram', 'character', { summary: 'Our rogue (Dan). Steals everything not nailed down.', tags: ['party', 'rogue', 'kleptomaniac'] });
ent('Sef', 'character', { summary: 'Our wizard (Priya). Reads every book, trusts no one.', tags: ['party', 'wizard'] });

ent('Grimbold Ironhand', 'npc', {
  summary: 'Dwarf smith in Brindol. Grumpy, fair, knows about the vault.',
  body: 'Fought in the Goblin War with Hask. Keeps a ledger of who owes him. We are in it.',
  tags: ['dwarf', 'smith', 'owe him money', 'actually decent'], aliases: ['Grim'],
});
ent('Mira Vane', 'npc', {
  summary: 'Fence at the Drowned Rat. Wants the sword. Claims she knew Mum.',
  tags: ['fence', 'do NOT trust', 'knows something about Lyra'], aliases: ['Mira'],
});
ent('Lord Aldric Thorne', 'npc', {
  summary: 'Owns the mill. Hired us. Lying through his teeth.',
  body: 'Offered 100 gp to clear the mill, half up front. Told us not to go below the first cellar.\n\nHis ring was in the bottom cellar. Draw your own conclusions.',
  tags: ['noble', 'fuck this guy', 'liar'], aliases: ['Aldric'],
});
ent('Sister Caldra', 'npc', { summary: 'Pale Lantern priestess. Healed Tam for free.', tags: ['healer', 'nice lady'] });
ent('Old Tam', 'npc', { summary: 'Ferryman. Knew Mum. Won’t take our coin.', tags: ['ferryman', 'legend'] });
ent('Lyra Ashdown', 'npc', { summary: 'Wren’s sister. Missing since the fire. Maybe alive??', tags: ['family', 'missing'] });
ent('Captain Hask', 'npc', { summary: 'Watch captain. Tired, outnumbered, maybe bent.', tags: ['cop', 'sus'] });
ent('Pip', 'npc', { summary: 'Street kid, runs messages for coppers.', tags: ['kid', 'best boy'] });
ent('The Knives', 'faction', { summary: 'Brindol’s thieves guild. Knife tattoos on the wrist.', tags: ['criminal', 'bastards'], aliases: ['Thieves Guild'] });
ent('Order of the Pale Lantern', 'faction', { summary: 'Healers who hunt undead.', aliases: ['Pale Lantern', 'Lantern'] });
ent('Brindol Watch', 'faction', { summary: '12 guards for 4000 people. Lol.' });
ent('Brindol', 'location', { summary: 'River town, two days south of the Thornwood.' });
ent('Thornwood', 'location', { summary: 'Where Wren grew up. Burned.', tags: ['home', 'trauma'] });
ent('The Drowned Rat', 'location', { summary: 'Dockside pub. Knives drink here. Ale is piss.', aliases: ['the Rat'] });
ent('Old Mill', 'location', { summary: 'Aldric’s mill. Tunnel to the Rat. Something under it.', tags: ['dungeon'], aliases: ['the mill'] });
ent('Saltmarsh Crypt', 'location', { summary: 'Flooded crypt east of town. Where we got the sword.' });
ent('Sunblade', 'item', { summary: 'Longsword, glows near undead. MINE.', tags: ['magic', 'glowy', 'everyone wants it'] });
ent('Aldric’s signet ring', 'item', { summary: 'Found in the mill cellar. Hollow King crest (per Caldra).', tags: ['evidence'], aliases: ['the ring'] });

// ---------- Notes, as typed at the table ----------
const notes = [];
let seq = 0;
function note(at, mode, typed, { triaged = null, original = null } = {}) {
  const key = `note:${++seq}`;
  const r = resolveMentions(typed, Object.values(ents));
  let text = r.text;
  let mentions = r.mentions;
  // New stubs (typos, unknown names) get stable ids and the note's time.
  for (const e of r.created) {
    const id = did(`ent:${e.name}`);
    text = text.split(e.id).join(id);
    mentions = mentions.map((m) => (m === e.id ? id : m));
    ents[e.name] = stamp(e, at, id);
  }
  notes.push(stamp(makeNote({ text, mode, mentions }), at, did(key), { triaged_at: triaged, original_text: original }));
}
const sorted = perth(26, '10:00');   // tidied up the morning of session 4

// Session 1, Fri 5 Sep
note(perth(5, '19:05'), 'in', 'session 1!! lets go', { triaged: sorted });
note(perth(5, '19:12'), 'in', 'arrived @Brindol at dusk, raining, river gate shuts after dark', { triaged: sorted });
note(perth(5, '19:30'), 'in', 'met @Grimbold_Ironhand at the forge. sells axes, asks too many qs', { triaged: sorted });
note(perth(5, '19:51'), 'in', '@Grim says vault under @the_mill sealed since the goblin war', { triaged: sorted });
note(perth(5, '20:20'), 'in', 'dinner at @The_Drowned_Rat. 2 guys w knife tattoos staring at us the whole time', { triaged: sorted });
note(perth(5, '20:44'), 'in', '@Mira_Vane just sat down at our table uninvited?? asked if we’d heard of a sword that glows', { triaged: sorted });
note(perth(5, '21:02'), 'in', '(pizza’s here, 10 min break)', { triaged: sorted });
note(perth(5, '21:15'), 'in', 'knife tattoos = @The_Knives. mira is one of them or close to it', { triaged: sorted });
note(perth(5, '21:40'), 'in', 'job from @Lord_Aldric_Thorne: clear @the_mill, 100gp, half up front', { triaged: sorted });
note(perth(5, '22:05'), 'in', '@Aldric REALLY didnt want us going below the first cellar. sus as hell', { triaged: sorted });
note(perth(5, '22:50'), 'in', 'rats the size of dogs 🐀🐀🐀 @Bram nearly died, burned the nest', { triaged: sorted });
note(perth(5, '23:20'), 'in', 'found @Aldric’s_signet_ring in the bottom cellar under the silt. the cellar he said nobody goes in. fuck this guy', { triaged: sorted });

// Between sessions
note(perth(8, '07:45'), 'out', 'thinking about who wren would actually trust here. nobody with a title. maybe the ferryman?', { triaged: sorted });
note(perth(10, '21:00'), 'out', 'backstory idea: @Lyra_Ashdown has a burn scar on her left palm, same fire', { triaged: sorted });

// Session 2, Fri 12 Sep
note(perth(12, '19:05'), 'in', 'recap: kept the ring, havent told @Aldric', { triaged: sorted });
note(perth(12, '19:25'), 'in', '@Old_Tam took us over the river. says a grey man crossed 3 nights in a row, always after midnight. @Grey_Man??', { triaged: sorted });
note(perth(12, '19:40'), 'in', 'Tam wont take wren’s coin, says "your mother paid me forward". ok crying', { triaged: sorted });
note(perth(12, '20:10'), 'in', '@Saltmarsh_Crypt flooded to the knees, skeletons that dont stay down', { triaged: sorted });
note(perth(12, '20:35'), 'in', 'got the @Sunblade off a drowned knight!!! glows near undead. DM rolled a nat 20 on the knight obviously', { triaged: sorted });
note(perth(12, '21:00'), 'in', 'map of the @Thornwood in the crypt too, old ranger paths marked. someone has been there recently', { triaged: sorted });
note(perth(12, '21:30'), 'in', 'Tam got crypt rot, @Sister_Caldra healed him for free. legend', { triaged: sorted });
note(perth(12, '22:00'), 'in', 'caldra is with the @Pale_Lantern, theyve been hunting undead in the marsh for a year', { triaged: sorted });
note(perth(12, '22:40'), 'in', 'we owe @Grim 20gp for the shield. he wrote it in the ledger in front of us lol', { triaged: sorted });
note(perth(12, '23:10'), 'in', '@Mira_Vane offered 300gp for the @Sunblade. said no. she smiled like she knew we would', { triaged: sorted });

// Between sessions
note(perth(15, '12:30'), 'out', 'ask DM: does the @Lantern know about the @Grey_Man?', { triaged: sorted });
note(perth(17, '20:15'), 'out', 'wren’s goal shifting. less revenge, more find lyra first', { triaged: sorted });

// Session 3, Fri 19 Sep
note(perth(19, '19:10'), 'in', '@Captain_Hask pulled us aside: 3 people missing from the docks this month, watch cant spare anyone', { triaged: sorted });
note(perth(19, '19:30'), 'in', 'hask and @Grim fought together in the goblin war. small world', { triaged: sorted });
note(perth(19, '19:55'), 'in', '@Pip saw the missing people go INTO @the_Rat. none came out the front', { triaged: sorted });
note(perth(19, '20:20'), 'in', 'paid pip 5cp, more if he finds the grey man. best boy', { triaged: sorted });
note(perth(19, '20:45'), 'in', 'rat cellar has a tunnel. smells exactly like the mill cellar', { triaged: sorted });
note(perth(19, '21:10'), 'in', 'TUNNEL GOES TO @the_mill. aldric 100% knows', { triaged: sorted });
note(perth(19, '21:40'), 'in', 'fight w @The_Knives in the tunnel. mira wasnt there but they knew our names. how', { triaged: sorted });
note(perth(19, '22:15'), 'in', 'caught one. they move "cargo" for someone called the @Hollow_King', { triaged: sorted });
note(perth(19, '22:50'), 'in', 'the cargo is PEOPLE. handed him to @Captain_Hask', { triaged: sorted });
note(perth(19, '23:25'), 'in', 'hask thanked us then told us to leave town for a week "for our safety". right.', { triaged: sorted });

// Between sessions: not sorted yet (these sit in the Inbox)
note(perth(22, '18:00'), 'out', 'dont trust @Captain_Hask telling us to leave. who is he covering for');
note(perth(24, '07:10'), 'out', 'if the @Hollow_King is buying people then @Aldric is selling them. calling it now');

// Session 4, Fri 26 Sep
note(perth(26, '19:08'), 'in', 'didnt leave lol. hiding at @Old_Tam’s hut across the river');
note(perth(26, '19:30'), 'in', '@Pip at dawn: grey man visits aldric every second night');
note(perth(26, '19:55'), 'in', 'showed @the_ring to @Sister_Caldra, she went white. crest is the hollow kings');
note(perth(26, '20:20'), 'in', '@Lantern will help if we bring proof. they want the @Sunblade used on whatever’s under the mill');
note(perth(26, '20:45'), 'in', '@Mira’s back. says she knew mum and that @Lyra_Ashdown is ALIVE');
note(perth(26, '21:10'), 'in', 'mira wants the sword in exchange for where lyra is. didnt answer. @Sef thinks its a trap, @Bram wants to steal it back after (classic bram)');
note(perth(26, '21:40'), 'in', 'paid @grimbolt back the 20gp, ledger squared', { original: 'paid grimbolt back the 20gp' });
note(perth(26, '22:15'), 'in', 'plan for next week: mill vault at night with the lantern. NOBODY holds the sword except wren. ok so the thing is, every single person in this town wants something from us and none of them have told us the full truth yet. aldric lies, mira bargains, hask sends us away, even caldra wants the sword used her way. tam and pip are the only ones who havent asked for anything and theyre the two with the least. writing that down because it feels important');
note(perth(26, '23:00'), 'in', 'DM hinted the @Thornwood fire wasnt an accident. oh no');

// ---------- Character page ----------
const profile = {
  concept: 'Exiled ranger looking for her missing sister',
  backstory: 'Raised in the Thornwood by her mum, a ranger of the old paths. When Wren was sixteen the forest burned. Mum died; her sister Lyra was never found.\n\nThe Thornwood council blamed Wren (she was on watch) and exiled her.',
  personality: 'Quiet, watchful, dry. Better with animals than people.',
  ideals: 'Freedom. Nobody should be caged.',
  bonds: 'Lyra, alive or dead. Old Tam, who knew Mum.',
  flaws: 'Trusts no one with a title. Holds grudges for years.',
  goals: 'Find Lyra. Then find who set the fire.',
  appearance: 'Tall, sun-browned, burn scar down the left forearm. Green cloak, mended a hundred times.',
  notes: 'This is the Satchel test character. The notes are written like real table notes (typos, swearing, chatter) on purpose, and a few things are left untidy to try the tools on:\n- 11 notes in the Inbox\n- "grimbolt": a typo stub to merge into Grimbold\n- "Grey Man" and "Hollow King": stubs with no type yet\n- one edited note (the grimbolt one)\nGo nuts.',
};
const pcEdited = perth(26, '10:05');
ents['Wren Ashdown'] = {
  ...ents['Wren Ashdown'],
  profile,
  profile_times: Object.fromEntries(Object.keys(profile).map((k) => [k, pcEdited])),
  updated_at: pcEdited,
};

// ---------- Relationships ----------
const T = (name) => {
  if (!ents[name]) throw new Error(`No entity ${name}`);
  return ents[name];
};
const rels = [];
function rel(from, type, to, directed, notesText = '') {
  rels.push(stamp(makeRelationship({ from_id: T(from).id, to_id: T(to).id, type, directed, notes: notesText }), sorted,
    did(`rel:${from}|${type}|${to}`)));
}
rel('Wren Ashdown', 'owes', 'Grimbold Ironhand', true, '20gp shield. paid back s4');
rel('Wren Ashdown', 'family', 'Lyra Ashdown', false, 'sister');
rel('Wren Ashdown', 'ally', 'Old Tam', false);
rel('Wren Ashdown', 'ally', 'Sister Caldra', false);
rel('Wren Ashdown', 'rival', 'Mira Vane', false, 'wants the sword');
rel('Wren Ashdown', 'raised in', 'Thornwood', true);
rel('Wren Ashdown', 'ally', 'Bram', false, 'party');
rel('Wren Ashdown', 'ally', 'Sef', false, 'party');
rel('Mira Vane', 'member of', 'The Knives', true);
rel('Sister Caldra', 'member of', 'Order of the Pale Lantern', true);
rel('Captain Hask', 'member of', 'Brindol Watch', true);
rel('Captain Hask', 'ally', 'Grimbold Ironhand', false, 'goblin war');
rel('Lord Aldric Thorne', 'works for', 'Hollow King', true, 'pretty sure');
rel('The Knives', 'located in', 'The Drowned Rat', true);
rel('Old Mill', 'located in', 'Brindol', true);
rel('Pip', 'works for', 'Wren Ashdown', true, '5cp a message');

// ---------- Files ----------
async function drawImages() {
  const browser = await firefox.launch();
  const page = await browser.newPage();
  const draw = async (src, w, h) => {
    const b64 = await page.evaluate(async ([src, w, h]) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      new Function('g', 'w', 'h', src)(c.getContext('2d'), w, h);
      const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.85));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (const x of bytes) s += String.fromCharCode(x);
      return btoa(s);
    }, [src, w, h]);
    return new Uint8Array(Buffer.from(b64, 'base64'));
  };
  const portrait = await draw(`
    g.fillStyle = '#B8D8C0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8A8A8A';
    for (let i = 0; i < 7; i++) { const x = 30 + i * 70; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 35, 120 + (i % 3) * 40); g.lineTo(x + 70, h); g.fill(); }
    g.fillStyle = '#4A4A4A';
    g.beginPath(); g.arc(w / 2, 230, 70, Math.PI, 0); g.lineTo(w / 2 + 110, h); g.lineTo(w / 2 - 110, h); g.closePath(); g.fill();
    g.fillStyle = '#E6CFA1'; g.beginPath(); g.ellipse(w / 2, 250, 38, 48, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 18; g.strokeStyle = '#4A4A4A'; g.beginPath(); g.arc(w / 2, 225, 72, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  `, 480, 600);
  const map = await draw(`
    g.fillStyle = '#E6CFA1'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8A8A8A'; g.lineWidth = 18; g.beginPath(); g.moveTo(0, 380); g.bezierCurveTo(300, 300, 500, 520, w, 420); g.stroke();
    g.fillStyle = '#B8D8C0'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(80 + (i * 37) % 420, 60 + (i * 53) % 180, 22, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#4A4A4A'; g.font = '28px serif';
    g.fillText('Thornwood', 170, 150); g.fillText('Brindol', 560, 330); g.fillText('Old Mill', 420, 470); g.fillText('Saltmarsh Crypt', 640, 560);
    g.fillRect(600, 340, 40, 30); g.fillRect(450, 480, 24, 24);
    g.lineWidth = 3; g.strokeStyle = '#4A4A4A'; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(250, 170); g.lineTo(600, 340); g.stroke();
    g.font = 'italic 22px serif'; g.fillText('X = ??? (ask tam)', 300, 240);
  `, 900, 620);
  await browser.close();
  return { portrait, map };
}

const { portrait, map } = await drawImages();
const enc = (s) => new TextEncoder().encode(s);
const handout = enc(`# letter off the knives guy (s3)

copied word for word:

> The cargo moves on the new moon. The usual door under the mill.
> Payment as before, to the Grey Man. He speaks for the King.
> Burn this.

he did not burn it. idiot.
`);
const loot = enc(`loot s2
- sunblade (wren's. hands off bram)
- 34gp 12sp (split 3 ways = 11gp 4sp each, bram owes sef 1sp)
- map of the thornwood
- soggy prayer book, lantern symbol on it?
`);

const files = [];
const fileBytes = new Map();
function addFile(name, kind, mime, bytes, entityName, at, dims = {}) {
  const f = stamp(makeFile({ name, kind, mime, size: bytes.length, entity_id: entityName ? T(entityName).id : null, ...dims }), at, did(`file:${name}`));
  files.push(f);
  fileBytes.set(f.id, bytes);
  return f;
}
const pf = addFile('wren-portrait.webp', 'image', 'image/webp', portrait, 'Wren Ashdown', sorted, { width: 480, height: 600 });
addFile('thornwood-map.webp', 'image', 'image/webp', map, 'Thornwood', perth(12, '21:05'), { width: 900, height: 620 });
addFile('knives-letter.md', 'text', 'text/markdown', handout, 'The Knives', perth(19, '22:20'));
addFile('loot-s2.txt', 'text', 'text/plain', loot, null, perth(12, '23:30'));
ents['Wren Ashdown'] = { ...ents['Wren Ashdown'], portrait_file_id: pf.id };

// ---------- Pack ----------
const entities = Object.values(ents);
const data = { bundle_id: BUNDLE, pc_entity_id: wren.id, entities, notes, sessions: [], relationships: rels, files, fileBytes };
const bytes = packKit(data, perth(30, '09:00'));
await writeFile(new URL('../../demo/wren.kit', import.meta.url), bytes);

const count = (pred) => entities.filter(pred).length;
console.log(`demo/wren.kit: ${entities.length} entities, ${notes.length} notes, ${rels.length} relationships, ${files.length} files, ${(bytes.length / 1024).toFixed(0)} KB`);
console.log(`npc ${count((e) => e.type === 'npc')}, characters ${count((e) => e.type === 'character') - 1}, stubs ${count((e) => e.stub)} (${entities.filter((e) => e.stub).map((e) => e.name).join(', ')})`);
console.log(`inbox: ${notes.filter((n) => !n.triaged_at).length} unsorted; Wren connections: ${new Set(rels.flatMap((r) => (r.from_id === wren.id ? [r.to_id] : r.to_id === wren.id ? [r.from_id] : []))).size}`);
