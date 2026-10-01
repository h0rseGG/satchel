// Merging two copies of the same character (SPEC 7.2). Pure, deterministic and
// order-independent: merge(A, B) and merge(B, A) give the same records (v1 lesson 4).
import { TABLES, newerOf, isLive } from './model.js';
import { sameValue } from './json.js';
import { key } from './text.js';
import { findStored, mentionIds } from './mentions.js';

const maxStr = (a, b) => ((a ?? '') >= (b ?? '') ? a : b);

// Profile sections merge one by one, so edits to different sections on two devices both survive.
function mergeProfile(a, b) {
  const base = newerOf(a, b);
  if (!a.profile && !b.profile) return base;
  const pa = a.profile || {};
  const pb = b.profile || {};
  const ta = a.profile_times || {};
  const tb = b.profile_times || {};
  const profile = { ...(base.profile || {}) };
  const times = {};
  for (const s of new Set([...Object.keys(pa), ...Object.keys(pb), ...Object.keys(ta), ...Object.keys(tb)])) {
    const at = ta[s] ?? '';
    const bt = tb[s] ?? '';
    if (at !== bt) profile[s] = (at > bt ? pa[s] : pb[s]) ?? '';
    else profile[s] = maxStr(pa[s] ?? '', pb[s] ?? '');
    times[s] = maxStr(ta[s], tb[s]);
  }
  for (const s of Object.keys(times)) if (times[s] == null) delete times[s];
  return { ...base, profile, profile_times: times };
}

function mergeRecord(table, a, b) {
  return table === 'entities' && (a.profile || b.profile) ? mergeProfile(a, b) : newerOf(a, b);
}

// local, incoming: bundles with the same bundle_id.
// Returns { bundle, report: { added, updated, stubsCombined }, blobsNeeded: [fileId] }.
export function mergeBundles(local, incoming) {
  if (local.bundle_id !== incoming.bundle_id) throw new Error('Different characters: use Replace');
  const report = { added: 0, updated: 0, stubsCombined: 0 };
  const bundle = { bundle_id: local.bundle_id, pc_entity_id: local.pc_entity_id ?? incoming.pc_entity_id };
  const blobsNeeded = [];

  for (const t of TABLES) {
    const map = new Map((local[t] || []).map((r) => [r.id, r]));
    for (const r of incoming[t] || []) {
      const l = map.get(r.id);
      if (!l) {
        map.set(r.id, r);
        if (isLive(r)) report.added++;
        if (t === 'files' && isLive(r)) blobsNeeded.push(r.id);
        continue;
      }
      const w = mergeRecord(t, l, r);
      if (!sameValue(w, l)) {
        report.updated++;
        if (t === 'files' && isLive(w) && !isLive(l)) blobsNeeded.push(r.id);
      }
      map.set(r.id, w);
    }
    bundle[t] = [...map.values()];
  }

  report.stubsCombined = combineDuplicateStubs(bundle);
  redirectMerged(bundle);
  return { bundle, report, blobsNeeded };
}

const byAge = (a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? -1 : (a.created_at ?? '') > (b.created_at ?? '') ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Stubs with the same name fold into the one real entity with that name, if there's
// exactly one; otherwise into the oldest stub. Every device picks the same survivor.
// The folded stub's updated_at is the group's newest, not "now", to stay deterministic.
export function combineDuplicateStubs(bundle) {
  const live = bundle.entities.filter(isLive);
  const stubs = new Map();
  const reals = new Map();
  for (const e of live) {
    const k = key(e.name);
    if (!k) continue;
    const m = e.stub ? stubs : reals;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  }
  const folded = new Map();
  for (const [k, group] of stubs) {
    const real = reals.get(k);
    let survivor;
    if (real?.length === 1) survivor = real[0];
    else if (group.length > 1) survivor = [...group].sort(byAge)[0];
    else continue;
    const stamp = [survivor, ...group].map((e) => e.updated_at).reduce(maxStr);
    for (const s of group) {
      if (s.id === survivor.id) continue;
      folded.set(s.id, { ...s, deleted: true, merged_into: survivor.id, updated_at: stamp });
    }
  }
  if (folded.size) bundle.entities = bundle.entities.map((e) => folded.get(e.id) ?? e);
  return folded.size;
}

// Points every reference at the entity that absorbed a merged one: note mentions,
// relationships, file attachments, link fields and the player character.
// Doesn't touch updated_at: the result is a function of the records, so devices agree.
export function redirectMerged(bundle) {
  const byId = new Map(bundle.entities.map((e) => [e.id, e]));
  const target = new Map();
  for (const e of bundle.entities) {
    if (!e.deleted || !e.merged_into) continue;
    let cur = e;
    const seen = new Set();
    while (cur?.deleted && cur.merged_into && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.merged_into);
    }
    if (cur && cur.id !== e.id) target.set(e.id, cur.id);
  }
  if (!target.size) return bundle;
  const to = (id) => target.get(id) ?? id;

  bundle.notes = bundle.notes.map((n) => {
    const stored = findStored(n.text);
    if (!stored.some((s) => target.has(s.id)) && !(n.promoted_to || []).some((id) => target.has(id))) return n;
    let text = '';
    let pos = 0;
    for (const s of stored) {
      text += n.text.slice(pos, s.start) + `@[${s.label}](${to(s.id)})`;
      pos = s.end;
    }
    text += n.text.slice(pos);
    return { ...n, text, mentions: mentionIds(text), promoted_to: [...new Set((n.promoted_to || []).map(to))] };
  });
  bundle.relationships = bundle.relationships.map((r) =>
    target.has(r.from_id) || target.has(r.to_id) ? { ...r, from_id: to(r.from_id), to_id: to(r.to_id) } : r);
  bundle.files = bundle.files.map((f) => (target.has(f.entity_id) ? { ...f, entity_id: to(f.entity_id) } : f));
  bundle.entities = bundle.entities.map((e) => {
    if (e.deleted || !e.fields) return e;
    const hit = Object.values(e.fields).some((v) => target.has(v));
    return hit ? { ...e, fields: Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, to(v)])) } : e;
  });
  bundle.pc_entity_id = to(bundle.pc_entity_id);
  return bundle;
}

// "Merge into…" (SPEC 5.2): `from` folds into `into`. from's name and aliases become
// aliases of into, tags join, empty text and field values are filled from `from`, and
// every reference follows (same redirect as kit merges). records: the bundle tables.
// Returns the records that changed, for one transaction.
export function mergeEntityInto(records, fromId, intoId, now) {
  const from = records.entities.find((e) => e.id === fromId);
  const into = records.entities.find((e) => e.id === intoId);
  if (!from || !into || from.deleted || into.deleted || fromId === intoId) throw new Error('Nothing to merge');
  if (records.pc_entity_id === fromId) throw new Error('The player character can’t be merged away');

  const k = key(into.name);
  const aliases = [...(into.aliases || [])];
  for (const n of [from.name, ...(from.aliases || [])]) {
    if (key(n) && key(n) !== k && !aliases.some((a) => key(a) === key(n))) aliases.push(n);
  }
  const tags = [...(into.tags || [])];
  for (const t of from.tags || []) if (!tags.some((x) => key(x) === key(t))) tags.push(t);
  const fields = { ...(from.fields || {}), ...Object.fromEntries(Object.entries(into.fields || {}).filter(([, v]) => v !== '' && v != null)) };

  const nextInto = {
    ...into, aliases, tags, fields,
    summary: into.summary || from.summary || '',
    body: [into.body, from.body].filter(Boolean).join('\n\n'),
    portrait_file_id: into.portrait_file_id ?? from.portrait_file_id ?? null,
    type_id: into.type_id ?? from.type_id ?? null,
    stub: into.stub && from.stub,
    updated_at: now,
  };
  if (nextInto.type_id) nextInto.stub = false;
  const nextFrom = { ...from, deleted: true, merged_into: intoId, updated_at: now };

  const bundle = {
    pc_entity_id: records.pc_entity_id,
    entities: records.entities.map((e) => (e.id === intoId ? nextInto : e.id === fromId ? nextFrom : e)),
    notes: records.notes, relationships: records.relationships, files: records.files,
  };
  redirectMerged(bundle);
  const before = new Map(['entities', 'notes', 'relationships', 'files'].flatMap((t) => records[t].map((r) => [`${t}:${r.id}`, r])));
  const changed = [];
  for (const t of ['entities', 'notes', 'relationships', 'files']) {
    for (const r of bundle[t]) if (before.get(`${t}:${r.id}`) !== r) changed.push({ table: t, record: r });
  }
  // Relationships that now point from an entity to itself mean nothing: remove them.
  return changed.map((c) => (c.table === 'relationships' && c.record.from_id === c.record.to_id ? { ...c, record: { ...c.record, deleted: true, updated_at: now } } : c));
}
