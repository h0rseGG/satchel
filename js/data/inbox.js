// Sorting notes out of the Inbox (SPEC 5.2). Each action is one transaction.
import { db } from './db.js';
import { saveMany } from './store.js';
import { getMeta } from './meta.js';
import { isoNow } from '../core/model.js';
import { plainText } from '../core/mentions.js';
import { day } from '../core/dates.js';
import { relationshipRecord } from './relationships.js';

const byCreated = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);

// Unsorted notes, oldest first. mode: 'all' | 'in' | 'out'.
export async function inboxNotes(mode = 'all') {
  const list = await db().notes.filter((n) => !n.deleted && !n.triaged_at && (mode === 'all' || n.mode === mode)).toArray();
  return list.sort(byCreated);
}

// Already sorted, newest first (for "Show sorted").
export async function sortedNotes(mode = 'all', limit = 100) {
  const list = await db().notes.filter((n) => !n.deleted && !!n.triaged_at && (mode === 'all' || n.mode === mode)).toArray();
  return list.sort(byCreated).reverse().slice(0, limit);
}

export async function inboxCount() {
  return db().notes.filter((n) => !n.deleted && !n.triaged_at).count();
}

const triaged = (n, now, extra = {}) => ({ ...n, ...extra, triaged_at: now, updated_at: now });

export async function keepAsLog(ids, { now = isoNow() } = {}) {
  const notes = (await db().notes.bulkGet(ids)).filter((n) => n && !n.deleted && !n.triaged_at);
  return saveMany(notes.map((n) => ({ table: 'notes', record: triaged(n, now) })), { now });
}

export async function backToInbox(id, { now = isoNow() } = {}) {
  const n = await db().notes.get(id);
  await saveMany([{ table: 'notes', record: { ...n, triaged_at: null, updated_at: now } }], { now });
}

// The note as a dated line: "26 Sep: paid Grimbold back the 20gp".
async function asLine(note) {
  const byId = new Map((await db().entities.toArray()).map((e) => [e.id, e]));
  return `${day(note.created_at)}: ${plainText(note.text, byId)}`;
}
const append = (text, line) => (text?.trim() ? `${text.trimEnd()}\n\n${line}` : line);

// "Add to <entity>": appended to its description.
export async function addToEntity(noteId, entityId, { now = isoNow() } = {}) {
  const [note, e] = await Promise.all([db().notes.get(noteId), db().entities.get(entityId)]);
  const line = await asLine(note);
  await saveMany([
    { table: 'entities', record: { ...e, body: append(e.body, line), updated_at: now } },
    { table: 'notes', record: triaged(note, now, { promoted_to: [...new Set([...(note.promoted_to || []), entityId])] }) },
  ], { now });
}

// "Add to my character": appended to one profile section (its time stamped for merges).
export async function addToProfile(noteId, section, { now = isoNow() } = {}) {
  const { pc_entity_id } = await getMeta('bundle');
  const [note, pc] = await Promise.all([db().notes.get(noteId), db().entities.get(pc_entity_id)]);
  const line = await asLine(note);
  const profile = { ...(pc.profile || {}), [section]: append(pc.profile?.[section], line) };
  await saveMany([
    { table: 'entities', record: { ...pc, profile, profile_times: { ...(pc.profile_times || {}), [section]: now }, updated_at: now } },
    { table: 'notes', record: triaged(note, now, { promoted_to: [...new Set([...(note.promoted_to || []), pc.id])] }) },
  ], { now });
}

// "Add as relationship": the note is kept as its source.
export async function addAsRelationship(noteId, { from_id, to_id, type, directed }, { now = isoNow() } = {}) {
  const note = await db().notes.get(noteId);
  const rel = relationshipRecord({ from_id, to_id, type, directed, notes: '', source_note_ids: [noteId] }, now);
  await saveMany([{ table: 'relationships', record: rel }, { table: 'notes', record: triaged(note, now) }], { now });
  return rel;
}
