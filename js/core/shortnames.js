// Short names: people say "Grimbold", not "Grimbold Ironhand" (SPEC 4.3). Pure.
import { key, nameWords, letterCount } from './text.js';
import { isLive } from './model.js';
import { isPerson } from './types.js';

// Map of word key -> entity. Only people (person types and stubs) get short names.
// A word counts when it has 4+ letters and belongs to no other entity: it isn't a
// word of another name, and it isn't another entity's whole name or alias.
// So a shared surname ("Ashdown") or a shared title ("Sister") never counts.
export function shortNames(entities, typesById = new Map()) {
  const live = entities.filter(isLive);
  const wordOwners = new Map();
  const fullOwners = new Map();
  const add = (map, k, id) => {
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(id);
  };
  for (const e of live) {
    for (const w of nameWords(e.name)) add(wordOwners, key(w), e.id);
    for (const n of [e.name, ...(e.aliases || [])]) add(fullOwners, key(n), e.id);
  }
  const othersOwn = (map, k, id) => [...(map.get(k) || [])].some((x) => x !== id);

  const out = new Map();
  for (const e of live) {
    if (!isPerson(e, typesById)) continue;
    const words = nameWords(e.name);
    if (words.length < 2) continue;
    for (const w of words) {
      const k = key(w);
      if (letterCount(w) < 4 || out.has(k)) continue;
      if (othersOwn(wordOwners, k, e.id) || othersOwn(fullOwners, k, e.id)) continue;
      out.set(k, e);
    }
  }
  return out;
}
