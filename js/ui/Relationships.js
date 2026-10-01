import { useState } from 'preact/hooks';
import { html } from './html.js';
import { useLive } from './useLive.js';
import { db, addRelationship, deleteRelationship } from '../db.js';
import { RELATIONSHIP_TYPES, directedByDefault, live } from '../model.js';
import { href } from './router.js';

// Live relationships touching an entity (both ends must still exist).
export function useRelationships(entityId, names) {
  const rels = useLive(async () => {
    if (!entityId) return [];
    const from = await db.relationships.where('from_id').equals(entityId).toArray();
    const to = await db.relationships.where('to_id').equals(entityId).toArray();
    return live([...from, ...to]);
  }, [entityId], []);
  return rels
    .filter((r) => names.has(r.from_id) && names.has(r.to_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

// "Kael owes Grimbold" or "Kael ↔ Mira (ally)". Names link to their pages
// (unless `plain`, e.g. on in-session recall cards).
export function RelationshipText({ r, names, pcId, plain = false }) {
  const link = (id) => {
    const name = names.get(id);
    if (plain) return html`<strong>${name}</strong>`;
    return html`<a href=${href(id === pcId ? '/character' : `/entity/${id}`)}><strong>${name}</strong></a>`;
  };
  return r.directed
    ? html`<span>${link(r.from_id)} ${r.type} ${link(r.to_id)}</span>`
    : html`<span>${link(r.from_id)} ↔ ${link(r.to_id)} (${r.type})</span>`;
}

// Relationships section for an entity or the character page: list + add form.
export function Relationships({ entity, names, pcId, onMessage }) {
  const rels = useRelationships(entity.id, names);
  const [other, setOther] = useState('');
  const [type, setType] = useState('');
  const [direction, setDirection] = useState('auto'); // auto | out | in | both
  const [notes, setNotes] = useState('');

  const directed = direction === 'auto' ? directedByDefault(type) : direction !== 'both';
  const shownDirection = direction === 'auto' ? (directedByDefault(type) ? 'out' : 'both') : direction;
  const others = [...names.entries()].filter(([id]) => id !== entity.id).map(([, n]) => n).sort();

  async function add(e) {
    e.preventDefault();
    try {
      await addRelationship({ selfId: entity.id, otherName: other, type, directed, outgoing: shownDirection !== 'in', notes });
      setOther(''); setType(''); setDirection('auto'); setNotes('');
    } catch (err) {
      onMessage({ kind: 'err', text: err.message });
    }
  }

  return html`
    <section class="rels" aria-label="Relationships">
      <h2 class="panel__title">Relationships (${rels.length})</h2>
      ${rels.length > 0 && html`
        <ul class="rels__list">
          ${rels.map((r) => html`
            <li key=${r.id} class="rels__row">
              <${RelationshipText} r=${r} names=${names} pcId=${pcId} />
              ${r.notes && html`<span class="muted"> · ${r.notes}</span>`}
              <button type="button" class="chip__x" aria-label=${`Remove relationship: ${names.get(r.from_id)} ${r.type} ${names.get(r.to_id)}`}
                onClick=${() => deleteRelationship(r.id)}>×</button>
            </li>`)}
        </ul>`}
      <form class="rels__form" onSubmit=${add}>
        <input class="input" aria-label="Relationship type" placeholder="Type, e.g. owes" list="rel-types" value=${type}
          onInput=${(e) => setType(e.currentTarget.value)} />
        <datalist id="rel-types">${RELATIONSHIP_TYPES.map(([t]) => html`<option value=${t} />`)}</datalist>
        <input class="input" aria-label="With" placeholder="With whom / what" list="rel-others" value=${other}
          onInput=${(e) => setOther(e.currentTarget.value)} />
        <datalist id="rel-others">${others.map((n) => html`<option value=${n} />`)}</datalist>
        <select class="input" aria-label="Direction" value=${shownDirection} onChange=${(e) => setDirection(e.currentTarget.value)}>
          <option value="out">${entity.name} → them</option>
          <option value="in">them → ${entity.name}</option>
          <option value="both">both ways</option>
        </select>
        <input class="input" aria-label="Relationship notes" placeholder="Notes (optional)" value=${notes}
          onInput=${(e) => setNotes(e.currentTarget.value)} />
        <button type="submit" class="btn">Add</button>
      </form>
    </section>
  `;
}
