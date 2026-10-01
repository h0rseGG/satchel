import { useEffect, useRef } from 'preact/hooks';
import { html } from './html.js';
import { NoteText } from './NoteText.js';
import { RecallCard } from './RecallCard.js';
import { formatShort } from './format.js';

// What the results area shows while you type. Bottom-up, best nearest the
// box: search hits (best last), then recall cards just above the box.
// linkState(entity) -> 'linkable' | 'linked' | null; onLink(entity) on tap.
export function Results({ cards, hits, notesById, entitiesById, notes, names, linkState, onLink }) {
  const ref = useRef(null);

  // Keep the bottom (cards, best hit) in view as results change.
  useEffect(() => {
    ref.current.scrollTop = ref.current.scrollHeight;
  });

  const hitRows = hits.map((h) => {
    if (h.kind === 'entity') {
      const e = entitiesById.get(h.ref);
      return e && html`
        <li class="hit" key=${`e-${e.id}`}>
          <strong>${e.name}</strong> <span class="muted">${e.stub ? 'stub' : e.type}</span>
          ${e.summary && html`<span> · ${e.summary}</span>`}
        </li>`;
    }
    const n = notesById.get(h.ref);
    return n && html`
      <li class="hit" key=${`n-${n.id}`}>
        <span class="muted hit__when">${formatShort(n.created_at)}</span>
        <${NoteText} text=${n.text} names=${names} />
      </li>`;
  }).reverse();

  return html`
    <main class="results results--live" ref=${ref} aria-live="polite">
      ${hits.length > 0 && html`<ul class="hits" aria-label="Search results">${hitRows}</ul>`}
      ${[...cards].reverse().map((e) => html`
        <${RecallCard} key=${e.id} entity=${e} notes=${notes} names=${names}
          link=${linkState(e)} onLink=${onLink} />
      `)}
      ${!cards.length && !hits.length && html`
        <p class="muted">No matches. Enter saves this as a note.</p>
      `}
    </main>
  `;
}
