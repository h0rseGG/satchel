import { html } from './html.js';
import { NoteText } from './NoteText.js';
import { formatShort } from './format.js';

const RECENT = 3;

// Short recall card: one-line summary plus the last 3 mentions (SPEC 6).
// notes: all live notes.
// link: 'linkable' (name typed without @: tap to link), 'linked', or null.
export function RecallCard({ entity, notes, names, link = null, onLink }) {
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
        <span class="muted">${entity.stub ? 'stub' : entity.type}</span>
        <span class="muted card__count">${mentions.length} mention${mentions.length === 1 ? '' : 's'}</span>
        ${linkable && html`<button type="button" class="card__link" tabindex="-1">Tap to link</button>`}
        ${link === 'linked' && html`<span class="card__link muted">Linked</span>`}
      </header>
      <p class="card__summary">${summary}</p>
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
