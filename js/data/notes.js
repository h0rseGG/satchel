// Notes: capture, edit, delete. Mentions are resolved here with the core rules.
import { db } from './db.js';
import { saveMany } from './store.js';
import { getMeta } from './meta.js';
import { isoNow, makeRecord, tombstone } from '../core/model.js';
import { buildNameIndex, resolveText, toTypedForm } from '../core/mentions.js';
import { tagKeys } from '../core/tags.js';
import { noteMode } from '../core/session.js';
import { allEntities } from './entities.js';
import { typesById } from './types.js';

async function nameIndex() {
  return buildNameIndex(await allEntities(), await typesById());
}

// typed: the capture box text; picks: [{ name, id }] from autocomplete.
// index: the capture store's name index, if the caller has it (saves re-reading entities).
export async function addNote(typed, { picks = [], now = isoNow(), mode, index } = {}) {
  const text = typed.trim();
  if (!text) return null;
  const r = resolveText(text, index ?? (await nameIndex()), { picks, now });
  const note = makeRecord('notes', {
    text: r.text, mentions: r.mentions, tags: tagKeys(r.text), mode: mode ?? noteMode(await getMeta('session')),
  }, { now });
  await saveMany([...r.stubs.map((s) => ({ table: 'entities', record: s })), { table: 'notes', record: note }], { now });
  return note;
}

// What the edit box starts with.
export async function editForm(id) {
  const note = await db().notes.get(id);
  return toTypedForm(note.text, new Map((await allEntities()).map((e) => [e.id, e])));
}

export async function editNote(id, typed, { picks = [], now = isoNow() } = {}) {
  const note = await db().notes.get(id);
  const r = resolveText(typed.trim(), await nameIndex(), { picks, now });
  if (r.text === note.text) return note;
  const next = {
    ...note, text: r.text, mentions: r.mentions, tags: tagKeys(r.text), updated_at: now,
    original_text: note.original_text ?? note.text,
  };
  await saveMany([...r.stubs.map((s) => ({ table: 'entities', record: s })), { table: 'notes', record: next }], { now });
  return next;
}

export async function deleteNote(id, { now = isoNow() } = {}) {
  const note = await db().notes.get(id);
  if (note && !note.deleted) await saveMany([{ table: 'notes', record: tombstone(note, now) }], { now });
}

// The session feed: notes written since the session started, oldest first.
export async function notesSince(iso) {
  return db().notes.where('created_at').aboveOrEqual(iso ?? '').filter((n) => !n.deleted).toArray();
}

export async function lastInSessionNoteAt() {
  const n = await db().notes.orderBy('created_at').reverse().filter((x) => !x.deleted && x.mode === 'in').first();
  return n?.created_at ?? null;
}

