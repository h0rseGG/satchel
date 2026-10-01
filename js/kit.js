// Kit files (.kit): pack (export) and unpack (read + validate) a character.
// Pure functions, unit tested with node. Format: SPEC.md section 5.
//
//   kael-2026-10-01-2130.kit   (a zip)
//   ├── character.json   manifest + entities, relationships, sessions, image metadata
//   ├── notes.jsonl      one note per line, tombstones included
//   └── images/<id>.webp
//
// Imports fflate by relative path so the same file loads in node tests.
import { zipSync, unzipSync, strToU8, strFromU8 } from '../vendor/fflate.mjs';
import { APP_VERSION, SCHEMA_VERSION, now } from './model.js';

export const FORMAT = 'satchel';
export const EXTENSION = '.kit';

// A problem that stops a kit being unpacked. `message` is shown to the user.
export class KitError extends Error {}

// ---------- Pack ----------

// data: { bundle_id, pc_entity_id, entities, notes, sessions, relationships,
//         images (metadata), imageFiles: Map(id -> Uint8Array) }
// Everything is included, tombstones too, so Merge can carry deletions.
// Local-only settings (backup/sync status, tokens) are never passed in.
export function packKit(data, exportedAt = now()) {
  const files = {};
  for (const [path, bytes] of Object.entries(kitFiles(data, exportedAt))) {
    // Images are already compressed: store them as-is (level 0).
    files[path] = [bytes, { level: path.startsWith('images/') ? 0 : 6 }];
  }
  return zipSync(files);
}

// The files that make up a kit, as { path: bytes }. Shared by packKit (which
// zips them) and sync (which commits them to GitHub as separate files).
export function kitFiles(data, exportedAt = now()) {
  const character = {
    format: FORMAT,
    schema_version: SCHEMA_VERSION,
    bundle_id: data.bundle_id,
    app_version: APP_VERSION,
    exported_at: exportedAt,
    pc_entity_id: data.pc_entity_id,
    entities: data.entities ?? [],
    relationships: data.relationships ?? [],
    sessions: data.sessions ?? [],
    images: data.images ?? [],
  };
  const notes = [...(data.notes ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const files = {
    'character.json': strToU8(JSON.stringify(character, null, 2)),
    'notes.jsonl': strToU8(notes.map((n) => JSON.stringify(n)).join('\n') + (notes.length ? '\n' : '')),
  };
  for (const [id, bytes] of data.imageFiles ?? []) files[`images/${id}.webp`] = bytes;
  return files;
}

// "Lord Aldric" + 2026-10-01 21:30 local -> "lord-aldric-2026-10-01-2130.kit"
export function kitFilename(pcName, at = new Date()) {
  const slug = String(pcName ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'character';
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}`;
  return `${slug}-${stamp}${EXTENSION}`;
}

// ---------- Unpack ----------

// Upgrades from older schema versions, applied in order to the parsed data.
// MIGRATIONS[n] turns version n into version n + 1. None yet: v1 is current.
export const MIGRATIONS = {};

const IMAGE_PATH = /^images\/([0-9a-f-]{36})\.webp$/;

// The only paths a kit may contain. Anything else (including "../" tricks)
// is ignored when reading.
export function isKitPath(path) {
  return path === 'character.json' || path === 'notes.jsonl' || IMAGE_PATH.test(path);
}

// Read and validate a kit file. Returns the data plus a report of anything
// skipped. Throws KitError for files that can't be used at all.
export function unpackKit(bytes) {
  let entries;
  try {
    entries = unzipSync(bytes, { filter: (f) => isKitPath(f.name) });
  } catch {
    throw new KitError("This isn't a kit file (it's not a valid zip).");
  }
  return readKitFiles(entries);
}

// Read and validate kit contents given as { path: bytes } (from a zip, or
// from the sync repo). Same checks either way.
export function readKitFiles(files) {
  const entries = Object.fromEntries(Object.entries(files).filter(([p]) => isKitPath(p)));
  if (!entries['character.json']) throw new KitError("This isn't a kit file (no character.json inside).");

  let character;
  try {
    character = JSON.parse(strFromU8(entries['character.json']));
  } catch {
    throw new KitError('The kit is damaged: character.json is not valid JSON.');
  }
  if (character?.format !== FORMAT) throw new KitError("This isn't a Satchel kit.");
  const version = character.schema_version;
  if (!Number.isInteger(version) || version < 1) throw new KitError('The kit has no valid schema version.');
  if (version > SCHEMA_VERSION) {
    throw new KitError(`This kit was made by a newer Satchel (schema ${version}). Update the app first.`);
  }

  const report = { skipped: [], duplicates: 0, migratedFrom: version < SCHEMA_VERSION ? version : null };

  // Notes: one per line; a bad line is skipped and reported, not fatal.
  const notes = [];
  const lines = entries['notes.jsonl'] ? strFromU8(entries['notes.jsonl']).split('\n') : [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      notes.push(JSON.parse(line));
    } catch {
      report.skipped.push(`notes.jsonl line ${i + 1}: not valid JSON`);
    }
  });

  let data = {
    schema_version: version,
    bundle_id: character.bundle_id,
    pc_entity_id: character.pc_entity_id,
    exported_at: character.exported_at,
    app_version: character.app_version,
    entities: character.entities ?? [],
    relationships: character.relationships ?? [],
    sessions: character.sessions ?? [],
    images: character.images ?? [],
    notes,
  };

  for (let v = version; v < SCHEMA_VERSION; v++) {
    if (!MIGRATIONS[v]) throw new KitError(`No upgrade path from schema ${v}.`);
    data = MIGRATIONS[v](data);
  }

  if (typeof data.bundle_id !== 'string' || !data.bundle_id) throw new KitError('The kit has no bundle id.');

  for (const table of ['entities', 'relationships', 'sessions', 'images', 'notes']) {
    data[table] = cleanRecords(data[table], table, report);
  }

  data.imageFiles = new Map();
  for (const [name, fileBytes] of Object.entries(entries)) {
    const m = name.match(IMAGE_PATH);
    if (m) data.imageFiles.set(m[1], fileBytes);
  }

  return { data, report };
}

// Drop records without an id/updated_at; for duplicate ids keep the newest.
function cleanRecords(records, table, report) {
  if (!Array.isArray(records)) {
    report.skipped.push(`${table}: not a list`);
    return [];
  }
  const byId = new Map();
  for (const r of records) {
    if (!r || typeof r.id !== 'string' || typeof r.updated_at !== 'string') {
      report.skipped.push(`${table}: record without id or updated_at`);
      continue;
    }
    const prev = byId.get(r.id);
    if (prev) {
      report.duplicates++;
      if (r.updated_at <= prev.updated_at) continue;
    }
    byId.set(r.id, r);
  }
  return [...byId.values()];
}
