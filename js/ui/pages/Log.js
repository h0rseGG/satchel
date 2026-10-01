import { useMemo, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useLive } from '../useLive.js';
import { db } from '../../db.js';
import { live, nameKey } from '../../model.js';
import { plain } from '../../mentions.js';
import { href } from '../router.js';
import { NoteItem } from '../NoteItem.js';

const PAGE = 100;

// #/log: every note, newest first, with a text filter. Edit or delete any.
export function Log({ onMessage }) {
  const notes = useLive(async () => live(await db.notes.toArray()), [], []);
  const entities = useLive(async () => live(await db.entities.toArray()), [], []);
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState(PAGE);

  const names = useMemo(() => new Map(entities.map((e) => [e.id, e.name])), [entities]);
  const q = nameKey(filter);
  const rows = notes
    .filter((n) => !q || nameKey(plain(n.text, (id) => names.get(id))).includes(q))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return html`
    <main class="page">
      <p class="crumb"><a href=${href('/')}>← Dashboard</a></p>
      <div class="page__head">
        <h1 class="page__title">All notes</h1>
        <span class="muted">${rows.length}${q ? ' matching' : ''}</span>
      </div>
      <div class="row list__tools">
        <input class="input" aria-label="Filter notes" placeholder="Filter notes" value=${filter}
          onInput=${(e) => { setFilter(e.currentTarget.value); setShown(PAGE); }} />
      </div>
      ${rows.length
        ? html`<ul class="inbox__list">${rows.slice(0, shown).map((n) => html`
            <${NoteItem} key=${n.id} note=${n} names=${names} onMessage=${onMessage} />`)}</ul>`
        : html`<p class="muted">${q ? 'Nothing matches.' : 'No notes yet.'}</p>`}
      ${rows.length > shown && html`
        <p><button type="button" class="btn" onClick=${() => setShown(shown + PAGE)}>Show ${Math.min(PAGE, rows.length - shown)} more</button></p>`}
    </main>
  `;
}
