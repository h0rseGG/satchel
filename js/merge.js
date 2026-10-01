// Merge two copies of a character (this device + an unpacked kit).
// Pure functions, unit tested with node. Rules: SPEC.md D9 and section 5.
//
// 1. Union by id. Same id on both sides: newest updated_at wins, a tie
//    keeps local. Deletions are tombstones, so they follow the same rule.
// 2. Duplicate stubs (same name, created separately on two devices) are
//    combined. The survivor is chosen the same way on every device (oldest,
//    then lowest id), so two devices merging each other's kits agree.
// 3. Anything pointing at a merged-away entity (note mentions,
//    relationships) is redirected to the survivor.

import { cleanTags, nameKey, now } from './model.js';
import { canonicalJson } from './kit.js';

export const TABLES = ['entities', 'notes', 'sessions', 'relationships', 'files'];

// local, incoming: { entities, notes, sessions, relationships, files } (arrays)
// Returns { tables, writes, report }:
//   tables: the merged result, per table
//   writes: only records that differ from local (what to save), per table
//   report: counts for the summary shown to the user
export function mergeData(local, incoming, at = now()) {
  const report = { added: 0, updated: 0, keptLocal: 0, unchanged: 0, stubsCombined: 0 };
  const tables = {};
  const localById = {};

  for (const t of TABLES) {
    const byId = new Map((local[t] ?? []).map((r) => [r.id, r]));
    localById[t] = new Map(byId);
    for (const r of incoming[t] ?? []) {
      const l = byId.get(r.id);
      if (!l) {
        byId.set(r.id, r);
        report.added++;
      } else if (t === 'entities' && hasProfile(l, r)) {
        // Character page: merge section by section, not whole record.
        const m = mergeProfiles(l, r);
        if (canonicalJson(m) === canonicalJson(l)) report.unchanged++;
        else { byId.set(r.id, m); report.updated++; }
      } else if (r.updated_at > l.updated_at) {
        byId.set(r.id, r);
        report.updated++;
      } else if (r.updated_at < l.updated_at) {
        report.keptLocal++;
      } else {
        report.unchanged++;
      }
    }
    tables[t] = [...byId.values()];
  }

  report.stubsCombined = combineDuplicateStubs(tables, at);
  redirectMerged(tables, at);

  const writes = {};
  for (const t of TABLES) {
    writes[t] = tables[t].filter((r) => localById[t].get(r.id) !== r);
  }
  return { tables, writes, report };
}

const hasProfile = (a, b) => !a.deleted && !b.deleted && (a.profile || b.profile);

// The same entity from two devices, both with a character profile. Every
// field except the profile comes from the newer record (tie: `a`, local);
// each profile section takes the side whose `profile_times` entry is newer,
// so editing Backstory on one device and Goals on the other keeps both.
// Deterministic and order-independent (equal times: the larger text wins),
// so two devices merging each other's copies end up identical.
export function mergeProfiles(a, b) {
  const newer = b.updated_at > a.updated_at ? b : a;
  const pa = a.profile ?? {};
  const pb = b.profile ?? {};
  const ta = a.profile_times ?? {};
  const tb = b.profile_times ?? {};
  const profile = {};
  const times = {};
  for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
    // Older data without per-section times: use the record's time.
    const tA = ta[k] ?? (k in pa ? a.updated_at : '');
    const tB = tb[k] ?? (k in pb ? b.updated_at : '');
    const useB = tB > tA || (tB === tA && (pb[k] ?? '') > (pa[k] ?? ''));
    profile[k] = useB ? pb[k] : pa[k];
    times[k] = useB ? tB : tA;
  }
  const updated_at = a.updated_at > b.updated_at ? a.updated_at : b.updated_at;
  return { ...newer, profile, profile_times: times, updated_at };
}

// Combine live stubs that share a name. Mutates `tables.entities` in place
// (replacing records, never editing them). Returns how many were combined.
// - Exactly one real (non-stub) entity with that name: stubs fold into it
//   (e.g. typed as an npc on one device, still a stub on the other).
// - No real one: stubs fold into the oldest stub.
// - Two or more real ones: ambiguous, so stubs only fold into each other;
//   the real ones are left for a manual merge.
export function combineDuplicateStubs(tables, at = now()) {
  const groups = new Map();
  for (const e of tables.entities) {
    if (e.deleted) continue;
    const key = nameKey(e.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const byAge = (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  const replace = new Map();
  for (const group of groups.values()) {
    const stubs = group.filter((e) => e.stub).sort(byAge);
    const reals = group.filter((e) => !e.stub);
    if (!stubs.length) continue;
    const survivor = reals.length === 1 ? reals[0] : stubs[0];
    for (const l of stubs) {
      if (l === survivor) continue;
      replace.set(l.id, { ...l, deleted: true, merged_into: survivor.id, updated_at: at });
    }
  }
  if (replace.size) tables.entities = tables.entities.map((e) => replace.get(e.id) ?? e);
  return replace.size;
}

// Manual "merge entities" (out-of-session entity page): fold `loserId` into
// `survivorId`. The loser's name and aliases become aliases (so typing the
// old name still finds the survivor), tags are combined, an empty summary is
// filled from the loser, descriptions are joined, and every mention or
// relationship is redirected. The loser becomes a tombstone with merged_into,
// so other devices redirect too when they sync. Mutates `tables` (replacing
// records, never editing them).
export function mergeEntityInto(tables, loserId, survivorId, at = now()) {
  if (loserId === survivorId) throw new Error('Pick a different entity to merge into.');
  const loser = tables.entities.find((e) => e.id === loserId && !e.deleted);
  const survivor = tables.entities.find((e) => e.id === survivorId && !e.deleted);
  if (!loser || !survivor) throw new Error('Both entities must exist.');

  const aliases = [];
  const seen = new Set([nameKey(survivor.name)]);
  for (const a of [...(survivor.aliases ?? []), loser.name, ...(loser.aliases ?? [])]) {
    const k = nameKey(a);
    if (k && !seen.has(k)) { seen.add(k); aliases.push(a); }
  }
  const merged = {
    ...survivor,
    aliases,
    tags: cleanTags([...(survivor.tags ?? []), ...(loser.tags ?? [])]),
    summary: survivor.summary || loser.summary,
    body: [survivor.body, loser.body].filter(Boolean).join('\n\n'),
    image_ids: [...new Set([...(survivor.image_ids ?? []), ...(loser.image_ids ?? [])])],
    // A stub merged into... keeps the real type if either side has one.
    type: survivor.stub && !loser.stub ? loser.type : survivor.type,
    stub: Boolean(survivor.stub && loser.stub),
    updated_at: at,
  };
  const tomb = { ...loser, deleted: true, merged_into: survivor.id, updated_at: at };
  tables.entities = tables.entities.map((e) => (e.id === survivor.id ? merged : e.id === loser.id ? tomb : e));
  redirectMerged(tables, at);
  return merged;
}

// Follow merged_into chains: a -> b -> c resolves a to c.
export function redirectMap(entities) {
  const next = new Map(entities.filter((e) => e.merged_into).map((e) => [e.id, e.merged_into]));
  const final = new Map();
  for (const id of next.keys()) {
    let cur = id;
    const seen = new Set();
    while (next.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = next.get(cur);
    }
    final.set(id, cur);
  }
  return final;
}

// Point note mentions and relationships at surviving entities.
// Only records that actually change are replaced (and get updated_at = at).
export function redirectMerged(tables, at = now()) {
  const map = redirectMap(tables.entities);
  if (!map.size) return;
  const to = (id) => map.get(id) ?? id;

  tables.notes = tables.notes.map((n) => {
    if (!n.mentions.some((id) => map.has(id))) return n;
    const text = n.text.replace(/@\[([^\]]*)\]\(([0-9a-f-]{36})\)/g, (m, label, id) => (map.has(id) ? `@[${label}](${to(id)})` : m));
    return { ...n, text, mentions: [...new Set(n.mentions.map(to))], updated_at: at };
  });

  tables.relationships = tables.relationships.map((r) => {
    if (!map.has(r.from_id) && !map.has(r.to_id)) return r;
    return { ...r, from_id: to(r.from_id), to_id: to(r.to_id), updated_at: at };
  });

  // Files attached to a merged-away entity move to the survivor.
  if (tables.files) {
    tables.files = tables.files.map((f) => (f.entity_id && map.has(f.entity_id)
      ? { ...f, entity_id: to(f.entity_id), updated_at: at }
      : f));
  }
}
