import { html } from '../html.js';
import { useLive } from '../useLive.js';
import { db, addNote } from '../../db.js';
import { live } from '../../model.js';
import { CaptureBox } from '../CaptureBox.js';
import { href } from '../router.js';
import { LIST_KEYS, PLURAL, listKeyOf } from '../labels.js';
import { Portrait, ThumbGrid } from '../files.js';

const RECENT_FILES = 8;

// Out-of-session home: panels that open full pages, plus a quick note.
export function Dashboard({ pcId, pc, onMessage }) {
  const entities = useLive(async () => live(await db.entities.toArray()), [], []);
  const inbox = useLive(async () => (await db.notes.toArray()).filter((n) => !n.deleted && !n.triaged_at).length, [], 0);
  const recentFiles = useLive(async () => live(await db.files.toArray())
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, RECENT_FILES), [], []);

  const counts = Object.fromEntries(LIST_KEYS.map((k) => [k, 0]));
  for (const e of entities) if (e.id !== pcId) counts[listKeyOf(e)]++;
  const concept = pc?.profile?.concept;

  return html`
    <main class="page dashboard">
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
      </section>
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
