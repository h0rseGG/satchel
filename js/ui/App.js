import { useEffect, useMemo, useState } from 'preact/hooks';
import { html } from './html.js';
import { useLive } from './useLive.js';
import { db, getMeta, addNote } from '../db.js';
import { live } from '../model.js';
import { linkPlainName } from '../mentions.js';
import { buildIndex, exactMatches, looksLikeQuery, search, searchQuery } from '../search.js';
import { FirstRun } from './FirstRun.js';
import { Feed } from './Feed.js';
import { Results } from './Results.js';
import { CaptureBox } from './CaptureBox.js';
import { Menu } from './Menu.js';
import { BackupBadge } from './BackupBadge.js';
import { BUILD } from '../version.js';

const FEED_LIMIT = 200;
const MAX_CARDS = 3;

export function App() {
  const bundleId = useLive(() => getMeta('bundle_id'), [], undefined);
  if (bundleId === undefined) return null; // still loading
  if (!bundleId) return html`<${FirstRun} />`;
  return html`<${Main} />`;
}

function Main() {
  const pcId = useLive(() => getMeta('pc_entity_id'), [], null);
  const entities = useLive(async () => live(await db.entities.toArray()), [], []);
  const notes = useLive(async () => live(await db.notes.orderBy('created_at').toArray()), [], []);
  const sessions = useLive(async () => live(await db.sessions.toArray()), [], []);

  // Short status message under the top bar (e.g. "Kit packed"), auto-hides.
  const [message, setMessage] = useState(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 8000);
    return () => clearTimeout(t);
  }, [message]);

  // What's in the box, and the highlighted @suggestion (for its recall card).
  const [draft, setDraft] = useState('');
  const [previewId, setPreviewId] = useState(null);

  const names = useMemo(() => new Map(entities.map((e) => [e.id, e.name])), [entities]);
  const entitiesById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const sessionNumbers = useMemo(() => new Map(sessions.map((s) => [s.id, s.number])), [sessions]);
  const index = useMemo(() => buildIndex(notes, entities), [notes, entities]);
  const pc = entitiesById.get(pcId);

  // Recall cards: highlighted suggestion first, then names found in the text.
  // The player character is left out; it would match nearly every note.
  const cardIds = [...new Set([
    previewId,
    ...exactMatches(draft, entities, { excludeIds: [pcId] }).map((e) => e.id),
  ])].filter((id) => id && id !== pcId && entitiesById.has(id)).slice(0, MAX_CARDS);
  const cards = cardIds.map((id) => entitiesById.get(id));

  // Short text (and not mid-@mention) also runs a full search.
  const querying = looksLikeQuery(draft) && !previewId;
  const hits = querying
    ? search(index, searchQuery(draft)).filter((h) => !(h.kind === 'entity' && cardIds.includes(h.ref)))
    : [];

  const showResults = draft.trim() && (cards.length || querying);

  // Cards for names typed without @ can be tapped to link them. The
  // highlighted @suggestion's card is left alone: tap the suggestion instead.
  const [linkRequest, setLinkRequest] = useState(null);
  const linkState = (e) => {
    if (e.id === previewId) return null;
    return linkPlainName(draft, e) ? 'linkable' : 'linked';
  };

  return html`
    <header class="topbar">
      <span class="topbar__title">${pc ? pc.name : 'Satchel'}</span>
      <span class="topbar__build muted" title="Build">${BUILD}</span>
      <${BackupBadge} />
      <${Menu} onMessage=${setMessage} />
    </header>
    ${message && html`
      <p class=${`message badge badge--${message.kind}`} role="status" onClick=${() => setMessage(null)}>${message.text}</p>
    `}
    ${showResults
      ? html`<${Results} cards=${cards} hits=${hits} notes=${notes} notesById=${notesById}
          entitiesById=${entitiesById} names=${names} sessionNumbers=${sessionNumbers}
          linkState=${linkState} onLink=${(entity) => setLinkRequest({ entity })} />`
      : html`<${Feed} notes=${notes.slice(-FEED_LIMIT)} names=${names} />`}
    <${CaptureBox}
      entities=${entities}
      onSave=${(text, picked) => addNote({ text, picked })}
      onDraft=${setDraft}
      onPreview=${setPreviewId}
      linkRequest=${linkRequest}
    />
  `;
}
