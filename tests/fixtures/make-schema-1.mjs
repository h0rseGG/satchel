// Builds tests/fixtures/schema-1.kit: a kit exactly as schema 1 wrote it
// (images/ folder, `images` records, no tags). Run once; the output is
// committed and kept forever so old kits stay importable (SPEC test plan).
//   node tests/fixtures/make-schema-1.mjs
import { writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from '../../vendor/fflate.mjs';

const t = '2026-10-01T09:00:00.000Z';
const base = { created_at: t, updated_at: t, deleted: false };
const pc = '00000000-0000-4000-8000-0000000000c1';
const img = '00000000-0000-4000-8000-0000000000f1';

const character = {
  format: 'satchel',
  schema_version: 1,
  bundle_id: '00000000-0000-4000-8000-0000000000b1',
  app_version: '0.1.0',
  exported_at: t,
  pc_entity_id: pc,
  entities: [{ ...base, id: pc, type: 'character', name: 'Kael', aliases: [], summary: '', body: '', stub: false, image_ids: [img], merged_into: null }],
  relationships: [],
  sessions: [],
  images: [{ ...base, id: img, entity_id: pc, file: `images/${img}.webp`, mime: 'image/webp', width: 2, height: 2, bytes: 4, caption: '' }],
};
const note = { ...base, id: '00000000-0000-4000-8000-0000000000a1', text: 'first note', original_text: null, mode: 'out', session_id: null, mentions: [], triaged_at: null, promoted_to: [] };

const zip = zipSync({
  'character.json': strToU8(JSON.stringify(character, null, 2)),
  'notes.jsonl': strToU8(`${JSON.stringify(note)}\n`),
  [`images/${img}.webp`]: new Uint8Array([82, 73, 70, 70]),
});
await writeFile(new URL('./schema-1.kit', import.meta.url), zip);
console.log('wrote schema-1.kit', zip.length, 'bytes');
