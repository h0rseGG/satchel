// The capture box's in-memory view: names, types, tag counts and the search index,
// kept up to date incrementally. Reloading all notes and rebuilding the index after
// every save took ~0.5 s at 5000 notes (M10); now only changed notes are re-indexed.
//
// - Entities and types come from one small live query, which also watches `epoch`.
// - Notes stream in by updated_at: the query reads notes at or after a watermark, and
//   Dexie re-runs it when such a note is written. Deletions are tombstones, so they come
//   through too. Writes that can bring older timestamps (kit imports, entity merges)
//   bump `epoch`, and then everything is reloaded.
import { liveQuery } from 'dexie';
import { db } from './db.js';
import { getMeta } from './meta.js';
import { buildNameIndex } from '../core/mentions.js';
import { createIndex, noteDoc, entityDoc, removeRecord } from '../core/search.js';
import { tagCounts } from '../core/tags.js';
import { sameValue } from '../core/json.js';
import { sortTypes } from '../core/types.js';

let entities = [];
let types = [];
let notes = new Map();
let index = createIndex();
let watermark = '';
let epoch = null;
let notesSub = null;
let loaded = { small: false, notes: false };
let snapshot = null;
const listeners = new Set();
let started = false;
let onError = (e) => console.error(e);

const byIdOf = () => new Map(entities.map((e) => [e.id, e]));
const live = (rs) => rs.filter((r) => !r.deleted);
// Same timestamp is only "unchanged" if the content agrees too (two edits in one millisecond).
const same = (a, b) => a.updated_at === b.updated_at && a.deleted === b.deleted && sameValue(a, b);
const nameChanged = (a, b) => a.name !== b.name || (a.aliases || []).join('\n') !== (b.aliases || []).join('\n');

function put(doc) {
  if (index.has(doc.id)) index.replace(doc);
  else index.add(doc);
}

function emit() {
  if (!loaded.small) return;
  const typesById = new Map(types.map((t) => [t.id, t]));
  snapshot = {
    entities: live(entities),
    byId: byIdOf(),
    types: sortTypes(live(types)),
    typesById,
    nameIndex: buildNameIndex(entities, typesById),
    searchIndex: index,
    notes: [...notes.values()],
    tags: tagCounts(notes.values()),
    notesReady: loaded.notes,
  };
  listeners.forEach((fn) => fn(snapshot));
}

function onSmall(next) {
  const typesById = new Map(next.types.map((t) => [t.id, t]));
  const before = byIdOf();
  const renamed = [];
  for (const e of next.entities) {
    const old = before.get(e.id);
    if (old && same(old, e)) continue;
    if (e.deleted) removeRecord(index, 'entity', e.id);
    else put(entityDoc(e, typesById));
    if (old && (nameChanged(old, e) || old.deleted !== e.deleted)) renamed.push(e.id);
  }
  for (const id of before.keys()) if (!next.entities.some((e) => e.id === id)) removeRecord(index, 'entity', id);
  entities = next.entities;
  types = next.types;
  loaded.small = true;
  if (epoch !== null && next.epoch !== epoch) {
    epoch = next.epoch;
    reloadNotes();
    return emit();
  }
  epoch = next.epoch;
  // Notes show mentions by name, so a rename re-indexes the notes that mention it.
  if (renamed.length) {
    const byId = byIdOf();
    for (const n of notes.values()) if (n.mentions?.some((id) => renamed.includes(id))) put(noteDoc(n, byId));
  }
  emit();
}

function onNotes(list) {
  const byId = byIdOf();
  let changed = false;
  for (const n of list) {
    const old = notes.get(n.id);
    if (old && same(old, n)) continue;
    changed = true;
    if (n.deleted) {
      notes.delete(n.id);
      removeRecord(index, 'note', n.id);
    } else {
      notes.set(n.id, n);
      put(noteDoc(n, byId));
    }
    if (n.updated_at > watermark) watermark = n.updated_at;
  }
  if (!loaded.notes) {
    loaded.notes = true;
    changed = true;
  }
  if (changed) emit();
}

function reloadNotes() {
  notesSub?.unsubscribe();
  notes = new Map();
  index = createIndex();
  watermark = '';
  loaded.notes = false;
  const typesById = new Map(types.map((t) => [t.id, t]));
  for (const e of live(entities)) put(entityDoc(e, typesById));
  notesSub = liveQuery(() => db().notes.where('updated_at').aboveOrEqual(watermark).toArray()).subscribe({ next: onNotes, error: (e) => onError(e) });
}

function start() {
  started = true;
  liveQuery(async () => ({ entities: await db().entities.toArray(), types: await db().types.toArray(), epoch: await getMeta('epoch') }))
    .subscribe({ next: onSmall, error: (e) => onError(e) });
  reloadNotes();
}

// fn(snapshot) now (if loaded) and on every change. Returns an unsubscribe function.
export function subscribeCapture(fn, errorHandler) {
  if (errorHandler) onError = errorHandler;
  listeners.add(fn);
  if (!started) start();
  if (snapshot) fn(snapshot);
  return () => listeners.delete(fn);
}
