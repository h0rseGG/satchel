import { html } from './html.js';
import { useLive } from './useLive.js';
import { db, getMeta, addNote } from '../db.js';
import { live } from '../model.js';
import { FirstRun } from './FirstRun.js';
import { Feed } from './Feed.js';
import { CaptureBox } from './CaptureBox.js';

const FEED_LIMIT = 200;

export function App() {
  const bundleId = useLive(() => getMeta('bundle_id'), [], undefined);
  if (bundleId === undefined) return null; // still loading
  if (!bundleId) return html`<${FirstRun} />`;
  return html`<${Main} />`;
}

function Main() {
  const pc = useLive(async () => db.entities.get(await getMeta('pc_entity_id')), [], null);
  const notes = useLive(
    async () => live(await db.notes.orderBy('created_at').reverse().limit(FEED_LIMIT).toArray()).reverse(),
    [],
    [],
  );

  return html`
    <header class="topbar">
      <span class="topbar__title">${pc ? pc.name : 'Satchel'}</span>
      <span class="badge badge--err">Not backed up</span>
    </header>
    <${Feed} notes=${notes} />
    <${CaptureBox} onSave=${(text) => addNote({ text })} />
  `;
}
