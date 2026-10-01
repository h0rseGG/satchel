// Search and recall-card matching. Pure functions, unit tested with node.
// Imports MiniSearch by relative path (not the "minisearch" import-map name)
// so the same file loads in the browser and in node tests.
import MiniSearch from '../vendor/minisearch.mjs';
import { plain } from './mentions.js';
import { nameKey } from './model.js';

const MAX_QUERY_WORDS = 4;

// Edits allowed per search word. Two letters swapped ("vualt") counts as 2,
// and that's a common phone typo, so longer words get 2.
export function typoAllowance(term) {
  if (term.length <= 3) return 0;
  if (term.length === 4) return 1;
  return 2;
}

// Build a full-text index over live notes and entities.
// Rebuilt whenever the data changes; fast enough at thousands of notes
// (measured in tests/unit/search.test.js).
export function buildIndex(notes, entities) {
  const names = new Map(entities.map((e) => [e.id, e.name]));
  const index = new MiniSearch({
    fields: ['name', 'text'],
    storeFields: ['kind', 'ref'],
    searchOptions: { prefix: true, fuzzy: typoAllowance, boost: { name: 3 }, combineWith: 'AND' },
  });
  index.addAll([
    ...entities.filter((e) => !e.deleted).map((e) => ({
      id: `e:${e.id}`, kind: 'entity', ref: e.id,
      name: [e.name, ...e.aliases].join(' '), text: [e.summary, ...(e.tags ?? [])].join(' '),
    })),
    ...notes.filter((n) => !n.deleted).map((n) => ({
      id: `n:${n.id}`, kind: 'note', ref: n.id,
      name: '', text: plain(n.text, (id) => names.get(id)),
    })),
  ]);
  return index;
}

// Returns [{ kind: 'entity'|'note', ref: id, score }], best first.
export function search(index, query, limit = 20) {
  const q = query.trim();
  if (!q) return [];
  return index.search(q).slice(0, limit).map((r) => ({ kind: r.kind, ref: r.ref, score: r.score }));
}

// Box text -> search text: drop @, underscores become spaces.
export function searchQuery(draft) {
  return draft.replace(/@/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

// Short text looks like a lookup rather than a note being written.
export function looksLikeQuery(draft) {
  const q = searchQuery(draft);
  return q.length > 0 && q.split(' ').length <= MAX_QUERY_WORDS;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Entities whose name or alias appears as a whole word in the draft
// (also matches the typed @Lord_Aldric form). Most recently typed first.
// excludeIds: e.g. the player character, which would match nearly every note.
export function exactMatches(draft, entities, { excludeIds = [], limit = 3 } = {}) {
  const text = nameKey(draft.replace(/_/g, ' '));
  const found = [];
  for (const e of entities) {
    if (e.deleted || excludeIds.includes(e.id)) continue;
    let last = -1;
    for (const key of [e.name, ...e.aliases].map(nameKey)) {
      if (!key) continue;
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(key)}(?![\\p{L}\\p{N}])`, 'gu');
      for (const m of text.matchAll(re)) last = Math.max(last, m.index);
    }
    if (last >= 0) found.push({ e, last });
  }
  found.sort((a, b) => b.last - a.last);
  return found.slice(0, limit).map((f) => f.e);
}
