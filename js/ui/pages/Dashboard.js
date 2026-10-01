import { useMemo, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useLive } from '../useLive.js';
import { db, addNote } from '../../db.js';
import { live } from '../../model.js';
import { buildIndex, search } from '../../search.js';
import { CaptureBox } from '../CaptureBox.js';
import { NoteText } from '../NoteText.js';
import { href } from '../router.js';
import { LIST_KEYS, PLURAL, listKeyOf, typeLabel } from '../labels.js';
import { Portrait, ThumbGrid } from '../files.js';
import { formatShort } from '../format.js';

const RECENT_FILES = 8;
const MAX_HITS = 30;

// Out-of-session home: search, panels that open full pages, a quick note.
export function Dashboard({ pcId, pc, onMessage }) {
  const entities = useLive(async () => live(await db.entities.toArray()), [], []);
  const notes = useLive(async () => live(await db.notes.toArray()), [], []);
  const recentFiles = useLive(async () => live(await db.files.toArray())
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, RECENT_FILES), [], []);
  const [query, setQuery] = useState('');

  const counts = Object.fromEntries(LIST_KEYS.map((k) => [k, 0]));
  for (const e of entities) if (e.id !== pcId) counts[listKeyOf(e)]++;
  const inbox = notes.filter((n) => !n.triaged_at).length;
  const concept = pc?.profile?.concept;

  return html`
    <main class="page dashboard">
      <div class="panel--wide dashboard__search">
        <input class="input" type="search" aria-label="Search everything" placeholder="Search notes, people, places, tags…"
          value=${query} onInput=${(e) => setQuery(e.currentTarget.value)}
          onKeyDown=${(e) => e.key === 'Escape' && setQuery('')} />
      </div>

      ${query.trim()
        ? html`<${SearchResults} query=${query} notes=${notes} entities=${entities} pcId=${pcId} />`
        : html`
          <section class="panel" aria-label="My character">
            <h2 class="panel__title"><a href=${href('/character')}>My character</a></h2>
            <${Portrait} entity=${pc} className="portrait portrait--small" />
            <p class="panel__big">${pc?.name}</p>
            <p class=${concept ? '' : 'muted'}>${concept || 'No concept yet. Open the page to write one.'}</p>
          </section>

          <section class="panel" aria-label="Inbox">
            <h2 class="panel__title"><a href=${href('/inbox')}>Inbox</a></h2>
            <p class="panel__big">${inbox} new note${inbox === 1 ? '' : 's'}</p>
            <p>${inbox ? html`<a href=${href('/inbox')}>Sort them →</a>` : html`<span class="muted">All sorted.</span>`}</p>
            <p><a href=${href('/log')}>All notes →</a></p>
          </section>

          <section class="panel panel--wide" aria-label="People and places">
            <h2 class="panel__title">People & places</h2>
            <ul class="counts">
              ${LIST_KEYS.map((k) => html`
                <li key=${k}>
                  <a class=${counts[k] ? '' : 'muted'} href=${href(`/list/${k}`)}>${PLURAL[k]} <strong>${counts[k]}</strong></a>
                </li>
              `)}
            </ul>
          </section>

          <section class="panel panel--wide" aria-label="Recent files">
            <h2 class="panel__title"><a href=${href('/files')}>Recent files</a></h2>
            ${recentFiles.length
              ? html`<${ThumbGrid} files=${recentFiles} />`
              : html`<p class="muted">No files yet. <a href=${href('/files')}>Add some →</a></p>`}
          </section>`}
    </main>
    <${CaptureBox}
      entities=${entities}
      placeholder="Quick note: goes to your Inbox. @ to mention."
      onSave=${async (text, picked) => {
        await addNote({ text, picked });
        onMessage({ kind: 'ok', text: 'Note saved to your Inbox.' });
      }}
    />
  `;
}

// Everything matching the query: entities first (they link to their pages),
// then notes, best match first. Typo-tolerant, like in-session search.
function SearchResults({ query, notes, entities, pcId }) {
  const index = useMemo(() => buildIndex(notes, entities), [notes, entities]);
  const names = useMemo(() => new Map(entities.map((e) => [e.id, e.name])), [entities]);
  const byId = useMemo(() => new Map([...entities, ...notes].map((r) => [r.id, r])), [entities, notes]);
  const hits = search(index, query, MAX_HITS).map((h) => ({ ...h, rec: byId.get(h.ref) })).filter((h) => h.rec);
  const ents = hits.filter((h) => h.kind === 'entity');
  const found = hits.filter((h) => h.kind === 'note');

  return html`
    <section class="panel panel--wide" aria-label="Search results">
      ${!hits.length && html`<p class="muted">Nothing found.</p>`}
      ${ents.length > 0 && html`
        <ul class="list">${ents.map(({ rec: e }) => html`
          <li key=${e.id}>
            <a class="list__row" href=${href(e.id === pcId ? '/character' : `/entity/${e.id}`)}>
              <strong>${e.name}</strong> <span class="muted">${typeLabel(e)}</span>
              ${e.tags?.length > 0 && html`<span class="muted">${e.tags.join(', ')}</span>`}
              ${e.summary && html`<span class="list__summary">${e.summary}</span>`}
            </a>
          </li>`)}
        </ul>`}
      ${found.length > 0 && html`
        <h2 class="panel__title dashboard__notes-title">Notes</h2>
        <ul class="hits">${found.map(({ rec: n }) => html`
          <li class="hit" key=${n.id}>
            <span class="muted hit__when">${formatShort(n.created_at)}</span>
            <span class="hit__text"><${NoteText} text=${n.text} names=${names} links /></span>
          </li>`)}
        </ul>`}
    </section>
  `;
}
