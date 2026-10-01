// Filtering and ordering notes in memory (the capture store holds them all). Pure.

const byCreated = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);

// mode: 'all' | 'in' | 'out'
const inMode = (mode) => (n) => mode === 'all' || n.mode === mode;

export const inbox = (notes, mode = 'all') => notes.filter((n) => !n.triaged_at && inMode(mode)(n)).sort(byCreated);
export const sorted = (notes, mode = 'all', limit = 100) => notes.filter((n) => n.triaged_at && inMode(mode)(n)).sort(byCreated).reverse().slice(0, limit);
export const inboxCount = (notes) => notes.reduce((c, n) => c + (n.triaged_at ? 0 : 1), 0);

// Newest first. filter: { mode, tag, entity }
export function filterNotes(notes, { mode = 'all', tag = '', entity = '' } = {}) {
  return notes
    .filter((n) => inMode(mode)(n) && (!tag || (n.tags || []).includes(tag)) && (!entity || (n.mentions || []).includes(entity)))
    .sort(byCreated)
    .reverse();
}

export function newest(notes, limit) {
  return [...notes].sort(byCreated).reverse().slice(0, limit);
}

// { [typeId]: count, stubs } for live entities, without the player character.
export function worldCounts(entities, pcId) {
  const counts = { stubs: 0 };
  for (const e of entities) {
    if (e.deleted || e.id === pcId) continue;
    if (!e.type_id) counts.stubs++;
    else counts[e.type_id] = (counts[e.type_id] || 0) + 1;
  }
  return counts;
}
