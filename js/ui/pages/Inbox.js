import { useMemo, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useLive } from '../useLive.js';
import { db, promoteNote, triageAll, triageKeep, untriage } from '../../db.js';
import { live } from '../../model.js';
import { plain } from '../../mentions.js';
import { href } from '../router.js';
import { NoteText } from '../NoteText.js';
import { Confirm } from '../fields.js';
import { formatDay, formatShort } from '../format.js';
import { SECTIONS } from './Character.js';

const MODES = [['', 'All'], ['in', 'In session'], ['out', 'Out of session']];
const SORTED_LIMIT = 100;

// #/inbox: sort new notes. Oldest first. Each note can be kept as log, added
// to a mentioned entity's description, or added to a character section.
export function Inbox({ pcId, onMessage }) {
  const notes = useLive(async () => live(await db.notes.toArray()), [], []);
  const entities = useLive(async () => live(await db.entities.toArray()), [], []);
  const [mode, setMode] = useState('');
  const [showSorted, setShowSorted] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const names = useMemo(() => new Map(entities.map((e) => [e.id, e.name])), [entities]);
  const byMode = (n) => !mode || n.mode === mode;
  const inbox = notes.filter((n) => !n.triaged_at && byMode(n))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sorted = notes.filter((n) => n.triaged_at && byMode(n))
    .sort((a, b) => b.triaged_at.localeCompare(a.triaged_at)).slice(0, SORTED_LIMIT);

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) onMessage({ kind: 'ok', text: ok });
    } catch (err) {
      onMessage({ kind: 'err', text: err.message });
    }
  };
  // What gets appended: the note's date, then its text with current names.
  const textOf = (n) => `${formatDay(n.created_at)}: ${plain(n.text, (id) => names.get(id))}`;

  return html`
    <main class="page inbox">
      <p class="crumb"><a href=${href('/')}>← Dashboard</a></p>
      <div class="page__head">
        <h1 class="page__title">Inbox</h1>
        <span class="muted">${inbox.length} new</span>
      </div>
      <div class="row inbox__tools" role="group" aria-label="Show">
        ${MODES.map(([m, label]) => html`
          <button type="button" key=${m} class=${`btn${mode === m ? ' btn--on' : ''}`} aria-pressed=${mode === m}
            onClick=${() => setMode(m)}>${label}</button>`)}
        <span class="inbox__spacer"></span>
        <button type="button" class="btn" aria-pressed=${showSorted} onClick=${() => setShowSorted(!showSorted)}>
          ${showSorted ? 'Show new' : 'Show sorted'}
        </button>
        ${!showSorted && inbox.length > 1 && html`
          <button type="button" class="btn" onClick=${() => setConfirmAll(true)}>Mark all as log</button>`}
      </div>

      ${!showSorted && (inbox.length
        ? html`<ul class="inbox__list">${inbox.map((n) => html`
            <${InboxNote} key=${n.id} note=${n} names=${names} entities=${entities} pcId=${pcId}
              onKeep=${() => run(() => triageKeep(n.id))}
              onToEntity=${(e) => run(() => promoteNote(n.id, { entityId: e.id }, textOf(n)), `Added to ${e.name}’s description.`)}
              onToCharacter=${(section, label) => run(() => promoteNote(n.id, { entityId: pcId, section }, textOf(n)), `Added to your ${label}.`)} />`)}
          </ul>`
        : html`<p class="muted">All sorted. New notes land here.</p>`)}

      ${showSorted && (sorted.length
        ? html`<ul class="inbox__list">${sorted.map((n) => html`
            <li key=${n.id} class="inbox__note">
              <div class="inbox__meta muted">${formatShort(n.created_at)} · ${n.mode === 'in' ? 'in session' : 'out of session'}
                ${n.promoted_to?.length > 0 && html` · added to ${n.promoted_to.map((id) => names.get(id) ?? '?').join(', ')}`}</div>
              <p class="inbox__text"><${NoteText} text=${n.text} names=${names} links /></p>
              <div class="row inbox__actions">
                <button type="button" class="btn" onClick=${() => run(() => untriage(n.id))}>Back to inbox</button>
              </div>
            </li>`)}
          </ul>`
        : html`<p class="muted">Nothing sorted yet.</p>`)}

      ${confirmAll && html`<${Confirm} title="Mark all as log?" action="Mark all"
        onCancel=${() => setConfirmAll(false)}
        onConfirm=${() => { setConfirmAll(false); run(async () => {
          const count = await triageAll(mode || null);
          onMessage({ kind: 'ok', text: `${count} note${count === 1 ? '' : 's'} kept as log.` });
        }); }}>
        <p>${inbox.length} note${inbox.length === 1 ? '' : 's'} leave the inbox and stay in the log. You can bring any back from “Show sorted”.</p>
      </${Confirm}>`}
    </main>
  `;
}

function InboxNote({ note, names, entities, pcId, onKeep, onToEntity, onToCharacter }) {
  const mentioned = note.mentions
    .filter((id) => id !== pcId)
    .map((id) => entities.find((e) => e.id === id))
    .filter(Boolean);
  return html`
    <li class="inbox__note">
      <div class="inbox__meta muted">${formatShort(note.created_at)} · ${note.mode === 'in' ? 'in session' : 'out of session'}</div>
      <p class="inbox__text"><${NoteText} text=${note.text} names=${names} links /></p>
      <div class="row inbox__actions">
        <button type="button" class="btn" onClick=${onKeep}>Keep as log</button>
        ${mentioned.map((e) => html`
          <button type="button" key=${e.id} class="btn" onClick=${() => onToEntity(e)}>Add to ${e.name}</button>`)}
        <select class="input inbox__select" aria-label="Add to my character"
          onChange=${(ev) => {
            const key = ev.currentTarget.value;
            ev.currentTarget.value = '';
            const s = SECTIONS.find(([k]) => k === key);
            if (s) onToCharacter(s[0], s[1].toLowerCase());
          }}>
          <option value="">Add to my character…</option>
          ${SECTIONS.map(([key, label]) => html`<option value=${key}>${label}</option>`)}
        </select>
      </div>
    </li>
  `;
}
