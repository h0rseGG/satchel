// The demo character, Wren Ashdown: a month of play typed like real table notes (SPEC 8).
// Notes go through the app's own resolver, so building the demo exercises the parser.
// Ids are derived from keys, so rebuilds give the same records and merge cleanly.
import { createHash } from 'node:crypto';
import { makeRecord, makePcEntity, PROFILE_SECTIONS } from '../js/core/model.js';
import { builtinTypes, makeType, addField } from '../js/core/types.js';
import { buildNameIndex, resolveText, toTypedForm, mentionIds } from '../js/core/mentions.js';
import { tagKeys } from '../js/core/tags.js';
import { key } from '../js/core/text.js';

export function stableId(k) {
  const h = createHash('sha256').update(`satchel-demo:${k}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Times are Perth local (UTC+8), written the way you'd say them.
const at = (s) => new Date(`${s.replace(' ', 'T')}:00+08:00`).toISOString();

export const EXPORTED_AT = at('2026-09-27 12:00');

const ENTITIES = [
  // key, name, type, created, extra
  ['kael', 'Kael Brightwater', 'type-character', '2026-09-05 19:30', { summary: 'Our bard. Charms anything with a pulse.' }],
  ['oswin', 'Brother Oswin', 'type-character', '2026-09-05 19:30', { summary: 'Cleric. Hates boats.' }],
  ['bess', 'Old Bess', 'type-npc', '2026-09-05 19:45', { summary: 'Runs the Drowned Lantern. Cheap ale, good stew.' }],
  ['aldric', 'Lord Aldric Thorne', 'type-npc', '2026-09-05 20:05', { summary: 'Owns the mill. Hired us. Lying through his teeth.', tags: ['noble', 'fuck this guy', 'liar'] }],
  ['grimbold', 'Grimbold Ironhand', 'type-npc', '2026-09-05 20:20', { summary: 'Dwarf smith and moneylender. 10% a week.', body: 'Forge is next to the mill; hates the night noise too.' }],
  ['caldra', 'Sister Caldra', 'type-npc', '2026-09-06 11:10', { summary: 'Temple healer. Knew mum.' }],
  ['morwen', 'Sister Morwen', 'type-npc', '2026-09-12 19:40', { summary: 'Also at the temple. Rude.' }],
  ['lyra', 'Lyra Ashdown', 'type-npc', '2026-09-05 21:50', { summary: 'My sister. Missing 3 years.', tags: ['family'] }],
  ['mira', 'Mira Vane', 'type-npc', '2026-09-19 20:10', { summary: 'Fence. Sold us the barrow map. Knew mum??', aliases: ['The Fox'], tags: ['fence', 'do NOT trust'] }],
  ['rook', 'Captain Rook Harlow', 'type-npc', '2026-09-19 21:30', { summary: 'Captain of the Gull’s Wake. Owes Mira a favour.' }],
  ['millbrook', 'Millbrook', 'type-location', '2026-09-05 19:35', { summary: 'Rainy mill town. Where it started.' }],
  ['lantern', 'The Drowned Lantern', 'type-location', '2026-09-05 19:45', { summary: 'The inn.' }],
  ['mill', 'Thorne Mill', 'type-location', '2026-09-05 20:05', { summary: 'Runs at night. Nobody sees workers.' }],
  ['saltmarsh', 'Saltmarsh', 'type-location', '2026-09-06 11:00', { summary: 'Where Lyra was last seen.' }],
  ['barrow', 'Hollow Barrow', 'type-location', '2026-09-19 20:30', { summary: 'Two days north. On Mira’s map.' }],
  ['locket', 'Lyra’s Locket', 'type-item', '2026-09-05 21:50', { summary: 'Dropped by someone fleeing the mill.' }],
  ['auril', 'Auril', 'type-deity', '2026-09-22 18:00', { aliases: ['The Frostmaiden'], fieldValues: { domain: 'Winter' } }],
  ['gull', 'The Gull’s Wake', 'type-ship', '2026-09-19 21:30', { fieldValues: { captain: 'rook' } }],
];

// [when, mode, text, { inbox, promote: [key], edit: { when, text } }]
const NOTES = [
  ['2026-09-05 19:40', 'in', 'ok session 1. we\'re in @Millbrook, rainy af 🌧️'],
  ['2026-09-05 19:46', 'in', 'inn = @The_Drowned_Lantern, run by @Old_Bess. cheap ale, good stew'],
  ['2026-09-05 19:55', 'in', 'bess says the mill\'s been running at night. noone sees workers'],
  ['2026-09-05 20:06', 'in', '@Lord_Aldric_Thorne owns the mill. hired us 50gp to "investigate the noises" lol ok'],
  ['2026-09-05 20:11', 'in', 'aldric\'s got rings on every finger. smug. #do_NOT_trust'],
  ['2026-09-05 20:14', 'in', 'kael rolled a nat 1 on persuasion and called him "my lord daddy" 💀'],
  ['2026-09-05 20:21', 'in', 'need money for gear. @Grimbold lends at 10% a WEEK?? highway robbery. took 20gp #debts'],
  ['2026-09-05 20:25', 'in', 'grimbold\'s forge is next to the mill, he hates the noise too', { promote: ['grimbold'] }],
  ['2026-09-05 20:40', 'in', 'brb pizza'],
  ['2026-09-05 21:30', 'in', 'mill at night: crates marked w/ a crown symbol. upside down #clue'],
  ['2026-09-05 21:52', 'in', 'someone fled N into the marsh, dropped a locket. it\'s @Lyra’s. HOW??? #lyra'],
  ['2026-09-05 22:55', 'in', 'end. 300xp. kael owes everyone a drink'],
  ['2026-09-06 11:05', 'out', 'lyra went missing 3 yrs ago from @Saltmarsh. last letter said something about "the hollow" #lyra'],
  ['2026-09-06 11:12', 'out', 'ask @Sister_Caldra at the temple about the locket — she knew mum'],

  ['2026-09-12 19:42', 'in', 'temple. @caldra is lovely. @Sister_Morwen is NOT, rude af'],
  ['2026-09-12 19:58', 'in', 'caldra: crown symbol = the hollow king. old smuggler legend #clue'],
  ['2026-09-12 20:03', 'in', '@Hollow_King running cargo thru the mill? aldric must know'],
  ['2026-09-12 20:20', 'in', 'kael fell asleep irl lmao'],
  ['2026-09-12 20:31', 'in', 'met a kid @Pip who sells info for sweets 🍬'],
  ['2026-09-12 20:36', 'in', 'pip says boats come in at the old jetty on new moons'],
  ['2026-09-12 20:50', 'in', '@Grimbol wants first payment already. 5gp. #debts', { inbox: true }],
  ['2026-09-12 21:15', 'in', 'FIGHT at the jetty!! 4 thugs. oswin nearly died 😬'],
  ['2026-09-12 21:40', 'in', 'thug had a tattoo, crown upside down. same as the crates'],
  ['2026-09-12 21:44', 'in', 'they called their boss @Vex. not the hollow king? lieutenant?'],
  ['2026-09-12 22:10', 'in', 'loot: 30gp, a ledger in code, nice dagger #loot'],
  ['2026-09-13 10:30', 'out', 'ledger: dates match new moons. initials A.T. on half the entries 👀 #clue', { inbox: true }],

  ['2026-09-19 19:45', 'in', 'back to the mill. aldric pretends nothing happened. lying thru his teeth #fuck_this_guy'],
  ['2026-09-19 19:52', 'in', '@Aldric says lyra is "a name he doesnt know". LIAR. he flinched', { edit: { when: '2026-09-20 09:15', append: ' (he knew @Lyra by name in the ledger)' } }],
  ['2026-09-19 20:11', 'in', '@Mira_Vane shows up. fence. sells us a map of the barrow for 40gp'],
  ['2026-09-19 20:15', 'in', 'mira knew mum?? says she\'ll explain later. wtf'],
  ['2026-09-19 20:31', 'in', '@Hollow_Barrow is 2 days north #lyra'],
  ['2026-09-19 20:48', 'in', 'paid grimbold 5gp #debts'],
  ['2026-09-19 21:05', 'in', 'caught one of the thugs. they move "cargo" for someone called the @Hollow_King'],
  ['2026-09-19 21:07', 'in', 'cargo = people?? 😡'],
  ['2026-09-19 21:20', 'in', '@The_Fox is mira\'s street name apparently'],
  ['2026-09-19 21:32', 'in', 'the boat at the jetty is @The_Gull’s_Wake. capt @Rook'],
  ['2026-09-22 18:05', 'out', '@Auril? the frostmaiden. mira said the hollow king\'s men pray to her. look up'],

  ['2026-09-26 19:40', 'in', 'paid @Grimbold back the 20gp, ledger squared #debts', { inbox: true }],
  ['2026-09-26 20:45', 'in', '@Mira’s back. says she knew mum and that @Lyra is ALIVE #lyra', { inbox: true }],
  ['2026-09-26 20:52', 'in', 'lyra is on the gull\'s wake?? sails in 3 days', { inbox: true }],
  ['2026-09-26 21:01', 'in', 'rook owes mira a favour. she can get us aboard', { inbox: true }],
  ['2026-09-26 21:20', 'in', 'aldric sent guards after us. 3 of them. kael charmed one, fuck yeah', { inbox: true }],
  ['2026-09-26 21:34', 'in', 'vex is aldric\'s SISTER?!?!', { inbox: true }],
  ['2026-09-26 21:50', 'in', 'found a note: "the King sails with the cold moon" #clue', { inbox: true }],
  ['2026-09-26 22:05', 'in', 'oswin: "i didnt sign up for boats"', { inbox: true }],
  ['2026-09-26 22:40', 'in', 'next sess: board the ship, find lyra. DONT TRUST ALDRIC #do_NOT_trust', { inbox: true }],
  ['2026-09-27 09:30', 'out', 'idea: ask bess for disguises before the docks', { inbox: true }],
];

const RELATIONSHIPS = [
  ['pc', 'lyra', 'family', false],
  ['pc', 'grimbold', 'owes', true],
  ['aldric', 'stub:hollow king', 'works for', true],
  ['aldric', 'grimbold', 'rival', false],
  ['mill', 'millbrook', 'located in', true],
  ['lantern', 'millbrook', 'located in', true],
  ['mira', 'pc', 'ally', false],
  ['stub:vex', 'aldric', 'family', false],
  ['rook', 'mira', 'owes', true],
];

const SONG = `Song of the Drowned Lantern
(Bess sings it when the rain comes in)

The lamp went down with the miller's boat,
the lamp went down with the light;
and every year when the river's high
it burns beneath at night.

So drink your ale and mind the stair
and don't go out alone;
the mill wheel turns when no one's there
and something calls it home.
`;

const PROFILE = {
  concept: 'Exiled ranger looking for her missing sister',
  backstory: 'Grew up in Saltmarsh. Left after a falling-out with the ranger lodge. Lyra vanished three years ago; her last letter mentioned "the hollow".',
  personality: 'Quiet, watchful, swears a lot when nervous.',
  ideals: 'Family first. Promises are kept.',
  bonds: 'Lyra. Mum\'s old friends, whoever they turn out to be.',
  flaws: 'Trusts nobody with a title.',
  goals: 'Find Lyra. Pay off Grimbold. Burn the mill down, maybe.',
  appearance: 'Tall, freckled, green cloak patched at the elbows.',
  notes: `This is a test character for trying Satchel. Change anything; nothing here is real.

Things to poke at:
- The Inbox has unsorted notes from session 4 (and two older strays). Sort them.
- "Grimbol" is a typo stub for Grimbold Ironhand. Merge it into him.
- Hollow King, Pip and Vex are stubs with no type yet. Give them one.
- Deity and Ship are custom types; a ship's Captain is a link field.
- One note was edited after the session; its first version is kept.
- In session, type "aldric" or "the fox" without @ and watch the recall cards.
- Search with a typo: "grimbld", "lantren".
- Tags: #debts, #do_NOT_trust, #fuck_this_guy.`,
};

export function buildDemo() {
  const id = (k) => (k === 'pc' ? stableId('pc') : k.startsWith('stub:') ? stableId(k) : stableId(`entity:${k}`));

  let deity = makeType({ label: 'Deity', plural: 'Deities', order: 10 }, { id: stableId('type:deity'), now: at('2026-09-22 18:00') });
  deity = addField(deity, { label: 'Domain', kind: 'text' }, { id: 'f-domain', now: at('2026-09-22 18:00') });
  let ship = makeType({ label: 'Ship', plural: 'Ships', order: 11 }, { id: stableId('type:ship'), now: at('2026-09-19 21:30') });
  ship = addField(ship, { label: 'Captain', kind: 'link', link_type: 'type-npc' }, { id: 'f-captain', now: at('2026-09-19 21:30') });
  const typeId = { 'type-deity': deity.id, 'type-ship': ship.id };
  const types = [...builtinTypes(), deity, ship];
  const typesById = new Map(types.map((t) => [t.id, t]));

  const pc = makePcEntity('Wren Ashdown', { id: id('pc'), now: at('2026-09-05 19:00') });
  pc.profile = { ...PROFILE };
  pc.profile_times = Object.fromEntries(PROFILE_SECTIONS.map((s) => [s, at('2026-09-06 10:00')]));
  pc.dndbeyond_url = 'https://www.dndbeyond.com/characters';
  pc.updated_at = at('2026-09-06 10:00');

  const entities = [pc];
  for (const [k, name, type, created, extra = {}] of ENTITIES) {
    const { fieldValues = {}, ...rest } = extra;
    const fields = {};
    if (fieldValues.domain) fields['f-domain'] = fieldValues.domain;
    if (fieldValues.captain) fields['f-captain'] = id(fieldValues.captain);
    entities.push(makeRecord('entities', { name, type_id: typeId[type] ?? type, ...rest, fields }, { id: id(`${k}`), now: at(created) }));
  }

  const notes = [];
  for (const [when, mode, typed, opts = {}] of NOTES) {
    const now = at(when);
    const index = buildNameIndex(entities, typesById);
    const r = resolveText(typed, index, { now, stubId: (name) => stableId(`stub:${key(name)}`) });
    entities.push(...r.stubs);
    let note = makeRecord('notes', { text: r.text, mentions: r.mentions, tags: tagKeys(r.text), mode }, { id: stableId(`note:${when}`), now });
    if (opts.edit) {
      // Edited the way the app does it: typed form with picks, then re-resolved.
      const form = toTypedForm(note.text, new Map(entities.map((e) => [e.id, e])));
      const edited = resolveText(form.text + opts.edit.append, buildNameIndex(entities, typesById), { picks: form.picks, now: at(opts.edit.when) });
      note = { ...note, original_text: note.text, text: edited.text, mentions: mentionIds(edited.text), tags: tagKeys(edited.text), updated_at: at(opts.edit.when) };
    }
    if (opts.promote) note.promoted_to = opts.promote.map(id);
    if (!opts.inbox) note.triaged_at = at(when.slice(0, 10) + ' 23:30');
    notes.push(note);
  }

  const relationships = RELATIONSHIPS.map(([from, to, type, directed]) =>
    makeRecord('relationships', { from_id: id(from), to_id: id(to), type, directed }, { id: stableId(`rel:${from}:${to}:${type}`), now: at('2026-09-20 10:00') }));

  const songBytes = new TextEncoder().encode(SONG);
  const song = makeRecord('files', {
    entity_id: id('lantern'), name: 'Song of the Drowned Lantern.md', kind: 'text', mime: 'text/markdown', size: songBytes.length, caption: 'Bess\'s song',
  }, { id: stableId('file:song'), now: at('2026-09-06 11:30') });

  return {
    bundle: { bundle_id: stableId('bundle'), pc_entity_id: pc.id, entities, types, notes, relationships, files: [song] },
    blobs: new Map([[song.id, songBytes]]),
  };
}
