import { html } from './html.js';
import { NoteText } from './NoteText.js';
import { RecallCard } from './RecallCard.js';
import { formatShort } from './format.js';

// What the results area shows while you type: recall cards, then search hits.
export function Results({ cards, hits, notesById, entitiesById, notes, names, sessionNumbers }) {
  return html`
    <main class="results" aria-live="polite">
      ${cards.map((e) => html`
        <${RecallCard} key=${e.id} entity=${e} notes=${notes} names=${names} sessionNumbers=${sessionNumbers} />
      `)}
      ${hits.length > 0 && html`
        <ul class="hits" aria-label="Search results">
          ${hits.map((h) => {
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
          })}
        </ul>
      `}
      ${!cards.length && !hits.length && html`
        <p class="muted">No matches. Enter saves this as a note.</p>
      `}
    </main>
  `;
}
