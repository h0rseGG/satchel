import { useState } from 'preact/hooks';
import { html } from './html.js';
import { typeLabel } from './labels.js';
import { NoteText } from './NoteText.js';
import { formatShort } from './format.js';
import { RelationshipText } from './Relationships.js';

const RECENT = 3;
// Quick types for a stub, most common first.
const QUICK_TYPES = ['npc', 'location', 'item', 'faction', 'character', 'other'];

// Handlers on buttons inside the card: act on pointerdown and keep focus
// (and the phone keyboard) in the box; don't trigger the card's own tap.
const press = (fn) => ({
  onPointerDown: (e) => { e.preventDefault(); e.stopPropagation(); fn(); },
});

// Short recall card: one-line summary plus the last 3 mentions (SPEC 6).
// notes: all live notes.
// link: 'linkable' (name typed without @: tap to link), 'linked', or null.
// onSetType(entity, type): quick type for stubs.
export function RecallCard({ entity, notes, names, relationships = [], link = null, onLink, onSetType }) {
  const [picking, setPicking] = useState(false);
  const rels = relationships
    .filter((r) => (r.from_id === entity.id || r.to_id === entity.id) && names.has(r.from_id) && names.has(r.to_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, RECENT);
  const mentions = notes
    .filter((n) => n.mentions.includes(entity.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const recent = mentions.slice(0, RECENT);
  const first = mentions[mentions.length - 1];

  let summary;
  if (entity.summary) summary = entity.summary;
  else if (mentions.length > RECENT) summary = html`First mention: <${NoteText} text=${first.text} names=${names} />`;
  else summary = html`<span class="muted">No summary yet.</span>`;

  const linkable = link === 'linkable';
  // pointerdown + preventDefault: keeps focus (and the phone keyboard) in the box.
  // The whole card is the tap target; the label inside is a real button so
  // the card keeps its "region" role for screen readers.
  const tap = linkable
    ? { onPointerDown: (e) => { e.preventDefault(); onLink(entity); } }
    : {};

  return html`
    <section class=${`card${linkable ? ' card--linkable' : ''}`} aria-label=${`Recall: ${entity.name}`} ...${tap}>
      <header class="card__head">
        <strong>${entity.name}</strong>
        ${entity.stub && onSetType
          ? html`<button type="button" class="card__type" tabindex="-1" aria-expanded=${picking}
              ...${press(() => setPicking(!picking))}>stub ▾</button>`
          : html`<span class="muted">${typeLabel(entity)}</span>`}
        ${entity.tags?.length > 0 && html`<span class="muted card__tags">${entity.tags.join(', ')}</span>`}
        <span class="muted card__count">${mentions.length} mention${mentions.length === 1 ? '' : 's'}</span>
        ${linkable && html`<button type="button" class="card__link" tabindex="-1">Tap to link</button>`}
        ${link === 'linked' && html`<span class="card__link muted">Linked</span>`}
      </header>
      ${picking && html`
        <div class="card__types" role="group" aria-label=${`Set type of ${entity.name}`}>
          ${QUICK_TYPES.map((t) => html`
            <button type="button" class="btn card__typebtn" tabindex="-1" key=${t}
              ...${press(() => { setPicking(false); onSetType(entity, t); })}>${t}</button>
          `)}
        </div>
      `}
      <p class="card__summary">${summary}</p>
      ${rels.length > 0 && html`
        <ul class="card__rels">
          ${rels.map((r) => html`<li key=${r.id}><${RelationshipText} r=${r} names=${names} plain /></li>`)}
        </ul>`}
      ${recent.length > 0 && html`
        <ul class="card__mentions">
          ${recent.map((n) => html`
            <li key=${n.id}>
              <span class="muted card__when">${formatShort(n.created_at)}</span>
              <span class="card__text"><${NoteText} text=${n.text} names=${names} /></span>
            </li>
          `)}
        </ul>
      `}
    </section>
  `;
}
