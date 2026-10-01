// Full-text search over notes and entities (SPEC 4.5, 5.2). Pure apart from the index object.
// Imports the vendored file by relative path so the same code runs in Node tests.
import MiniSearch from '../../vendor/minisearch.mjs';
import { segments } from './mentions.js';
import { PROFILE_SECTIONS } from './model.js';

// Typo tolerance by word length: 0 edits up to 3 letters, 1 for 4, 2 for 5+.
// MiniSearch counts edits as Levenshtein distance, so swapped letters cost 2.
export function maxEdits(term) {
  return term.length <= 3 ? 0 : term.length === 4 ? 1 : 2;
}

// While typing in session, only short text also runs a full search.
export function shouldSearch(text) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4;
}

// A mention is indexed as shown ("Mira") and by the entity's full name ("Mira Vane"),
// so searching either finds the note.
function noteSearchText(text, byId) {
  return segments(text, byId).map((s) => {
    if (s.type !== 'mention') return s.text;
    const name = byId.get(s.id)?.name;
    return name && name !== s.label ? `${s.label} ${name}` : s.label;
  }).join('');
}

export function noteDoc(note, byId) {
  return { id: `n:${note.id}`, kind: 'note', ref: note.id, name: '', tags: (note.tags || []).join(' '), text: noteSearchText(note.text, byId) };
}

export function entityDoc(entity, typesById = new Map()) {
  const type = typesById.get(entity.type_id);
  const fieldText = (type?.fields || [])
    .filter((f) => f.kind !== 'link')
    .map((f) => entity.fields?.[f.id])
    .filter((v) => v != null && v !== '');
  const profile = entity.profile ? PROFILE_SECTIONS.map((s) => entity.profile[s]).filter(Boolean) : [];
  return {
    id: `e:${entity.id}`, kind: 'entity', ref: entity.id,
    name: [entity.name, ...(entity.aliases || [])].join(' '),
    tags: (entity.tags || []).join(' '),
    text: [entity.summary, entity.body, ...fieldText, ...profile].filter(Boolean).join('\n'),
  };
}

export function createIndex() {
  return new MiniSearch({
    idField: 'id',
    fields: ['name', 'tags', 'text'],
    storeFields: ['kind', 'ref'],
    searchOptions: {
      prefix: true,
      fuzzy: (term) => maxEdits(term),
      combineWith: 'AND',
      boost: { name: 3, tags: 2 },
    },
  });
}

// Live records only. Replaces documents that are already indexed.
export function indexRecords(index, { notes = [], entities = [], typesById = new Map() }) {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const docs = [
    ...notes.filter((n) => !n.deleted).map((n) => noteDoc(n, byId)),
    ...entities.filter((e) => !e.deleted).map((e) => entityDoc(e, typesById)),
  ];
  for (const d of docs) if (index.has(d.id)) index.discard(d.id);
  index.addAll(docs);
  return index;
}

export function removeRecord(index, kind, id) {
  const docId = `${kind === 'note' ? 'n' : 'e'}:${id}`;
  if (index.has(docId)) index.discard(docId);
}

// Results: [{ kind, ref, score }], best first.
export function search(index, query, { kind, limit = 50 } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  return index
    .search(q, kind ? { filter: (r) => r.kind === kind } : undefined)
    .slice(0, limit)
    .map((r) => ({ kind: r.kind, ref: r.ref, score: r.score }));
}
