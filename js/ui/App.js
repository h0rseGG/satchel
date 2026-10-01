import { useEffect, useMemo, useState } from 'preact/hooks';
import { html } from './html.js';
import { useLive } from './useLive.js';
import { db, getMeta, addNote, backupMeta, lastInNoteAt, sessionMeta, setMode } from '../db.js';
import { backupStatus } from '../backup.js';
import { shouldAutoEnd } from '../session.js';
import { EndNudge } from './EndNudge.js';
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
  const session = useLive(sessionMeta, [], { mode: 'out', mode_since: null });

  // Short status message under the top bar (e.g. "Kit packed"), auto-hides.
  const [message, setMessage] = useState(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 8000);
    return () => clearTimeout(t);
  }, [message]);

  // In / Out of session. Ending a session with unsaved changes nudges a backup.
  const [nudge, setNudge] = useState(null);
  async function toggleSession() {
    if (session.mode === 'in') {
      await setMode('out');
      const status = backupStatus(await backupMeta());
      if (status.kind !== 'ok') setNudge(status);
    } else {
      await setMode('in');
    }
  }

  // Auto-end after 12 h idle (checked on open and every minute).
  useEffect(() => {
    if (session.mode !== 'in') return;
    const check = async () => {
      if (shouldAutoEnd(session, await lastInNoteAt())) {
        await setMode('out');
        setMessage({ kind: 'neutral', text: 'Session ended automatically after 12 hours without notes.' });
      }
    };
    check();
    const t = setInterval(check, 60 * 1000);
    return () => clearInterval(t);
  }, [session.mode, session.mode_since]);

  // What's in the box, and the highlighted @suggestion (for its recall card).
  const [draft, setDraft] = useState('');
  const [previewId, setPreviewId] = useState(null);

  const names = useMemo(() => new Map(entities.map((e) => [e.id, e.name])), [entities]);
  const entitiesById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
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
      ${session.mode === 'in' && html`<span class="topbar__session muted">In session</span>`}
      <span class="topbar__build muted" title="Build">${BUILD}</span>
      <${BackupBadge} onMessage=${setMessage} />
      <${Menu} onMessage=${setMessage} mode=${session.mode} onToggleSession=${toggleSession} />
    </header>
    ${nudge && html`<${EndNudge} status=${nudge} onMessage=${setMessage} onClose=${() => setNudge(null)} />`}
    ${message && html`
      <p class=${`message badge badge--${message.kind}`} role="status" onClick=${() => setMessage(null)}>${message.text}</p>
    `}
    ${showResults
      ? html`<${Results} cards=${cards} hits=${hits} notes=${notes} notesById=${notesById}
          entitiesById=${entitiesById} names=${names}
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
