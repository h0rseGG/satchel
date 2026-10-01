// Kit files: a zip of character.json, notes.jsonl and files/ (SPEC 7.1). Pure.
import { zipSync, unzipSync, strToU8, strFromU8 } from '../../vendor/fflate.mjs';
import { canonicalJson } from './json.js';
import { normalise, newerOf, TABLES } from './model.js';
import { builtinTypes } from './types.js';
import { extFor } from './files-rules.js';

export const FORMAT = 'satchel';
export const SCHEMA_VERSION = 3;

// Older v2 schemas get upgraded in memory, one step at a time: { 3: (doc) => doc4, ... }.
// v1 kits (schema 1-2) are refused: decision 2026-10-01, no v1 import.
const MIGRATIONS = {};

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byCreated = (a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? -1 : (a.created_at ?? '') > (b.created_at ?? '') ? 1 : byId(a, b));

// "Wren Ashdown" -> "wren-ashdown". ASCII only: accents folded, everything else dropped.
export function slug(name) {
  const s = String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return s || 'character';
}

const pad = (n) => String(n).padStart(2, '0');

// <character>-YYYY-MM-DD-HHmm.kit in the device's local time.
export function kitFilename(name, date) {
  return `${slug(name)}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.kit`;
}

// bundle: { bundle_id, pc_entity_id, entities, types, notes, relationships, files }
// blobs: Map(fileId -> Uint8Array). Only live files carry bytes.
export function packKit(bundle, blobs, { now = new Date() } = {}) {
  const exported_at = now.toISOString();
  const doc = {
    format: FORMAT,
    schema_version: SCHEMA_VERSION,
    bundle_id: bundle.bundle_id,
    exported_at,
    pc_entity_id: bundle.pc_entity_id,
    entities: [...bundle.entities].sort(byId),
    types: [...bundle.types].sort(byId),
    relationships: [...bundle.relationships].sort(byId),
    files: [...bundle.files].sort(byId),
  };
  // A fixed timestamp on every entry keeps the zip bytes a function of the data alone.
  const mtime = now;
  const entries = {
    'character.json': [strToU8(canonicalJson(doc, 2) + '\n'), { level: 6, mtime }],
    'notes.jsonl': [strToU8([...bundle.notes].sort(byCreated).map((n) => canonicalJson(n) + '\n').join('')), { level: 6, mtime }],
  };
  for (const f of doc.files) {
    const bytes = blobs.get(f.id);
    const ext = extFor(f.mime);
    if (f.deleted || !bytes || !ext) continue;
    entries[`files/${f.id}.${ext}`] = [bytes, { level: 0, mtime }];
  }
  const pc = bundle.entities.find((e) => e.id === bundle.pc_entity_id);
  return { bytes: zipSync(entries), filename: kitFilename(pc?.name, now), exported_at };
}

const fail = (error, detail) => ({ ok: false, error, detail });

// Validates everything before the caller touches the database.
// Errors: not-zip, no-character, bad-json, wrong-format, newer, v1-kit, bad-kit.
export function unpackKit(bytes) {
  let zip;
  try {
    zip = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch (e) {
    return fail('not-zip', e.message);
  }
  if (!zip['character.json']) return fail('no-character');

  let doc;
  try {
    doc = JSON.parse(strFromU8(zip['character.json']));
  } catch (e) {
    return fail('bad-json', e.message);
  }
  if (!doc || typeof doc !== 'object' || doc.format !== FORMAT) return fail('wrong-format');
  const v = doc.schema_version;
  if (!Number.isInteger(v)) return fail('bad-kit', 'schema_version');
  if (v > SCHEMA_VERSION) return fail('newer', v);
  if (v < 3) return fail('v1-kit', v);
  for (let n = v; n < SCHEMA_VERSION; n++) doc = MIGRATIONS[n](doc);

  if (typeof doc.bundle_id !== 'string' || !doc.bundle_id) return fail('bad-kit', 'bundle_id');
  for (const t of ['entities', 'types', 'relationships', 'files']) {
    if (doc[t] != null && !Array.isArray(doc[t])) return fail('bad-kit', t);
  }

  const report = { skippedNoteLines: 0, duplicates: 0, droppedRecords: 0, ignoredPaths: 0, missingFiles: 0 };

  const notes = [];
  const lines = zip['notes.jsonl'] ? strFromU8(zip['notes.jsonl']).split('\n') : [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const n = JSON.parse(line);
      if (n && typeof n === 'object' && !Array.isArray(n)) notes.push(n);
      else report.skippedNoteLines++;
    } catch {
      report.skippedNoteLines++;
    }
  }

  const raw = { entities: doc.entities ?? [], types: doc.types ?? [], relationships: doc.relationships ?? [], files: doc.files ?? [], notes };
  const bundle = { bundle_id: doc.bundle_id, pc_entity_id: doc.pc_entity_id, exported_at: doc.exported_at ?? null };
  for (const t of TABLES) bundle[t] = dedupe(t, raw[t], report);

  // Built-ins must always exist, whatever the kit says.
  const haveType = new Set(bundle.types.map((t) => t.id));
  for (const b of builtinTypes()) if (!haveType.has(b.id)) bundle.types.push(b);

  const pc = bundle.entities.find((e) => e.id === bundle.pc_entity_id && !e.deleted);
  if (!pc) return fail('bad-kit', 'pc_entity_id');

  // Only files/<id>.<ext> for a live file record in this kit; anything else (including ../) is ignored.
  const wanted = new Map(bundle.files.filter((f) => !f.deleted && extFor(f.mime)).map((f) => [`files/${f.id}.${extFor(f.mime)}`, f.id]));
  const blobs = new Map();
  for (const [path, data] of Object.entries(zip)) {
    if (path === 'character.json' || path === 'notes.jsonl' || path.endsWith('/')) continue;
    const id = wanted.get(path);
    if (id) blobs.set(id, data);
    else report.ignoredPaths++;
  }
  report.missingFiles = [...wanted.values()].filter((id) => !blobs.has(id)).length;

  return { ok: true, bundle, blobs, report };
}

// Drops records without an id, fills defaults, and keeps the newest of duplicate ids.
function dedupe(table, records, report) {
  const out = new Map();
  for (const r of records) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) {
      report.droppedRecords++;
      continue;
    }
    const rec = normalise(table, r);
    if (out.has(rec.id)) {
      report.duplicates++;
      out.set(rec.id, newerOf(out.get(rec.id), rec));
    } else {
      out.set(rec.id, rec);
    }
  }
  return [...out.values()];
}

// Which import modes a kit allows (SPEC 7.2). localBundleId is null when the app is empty.
// Replace is always offered: it's how you switch characters or discard local data.
export function importModes(localBundleId, kitBundleId) {
  if (!localBundleId) return ['new'];
  return localBundleId === kitBundleId ? ['merge', 'replace'] : ['replace'];
}
