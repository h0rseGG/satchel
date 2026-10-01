import { useMemo, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useLive } from '../useLive.js';
import { db, promoteNote, promoteNoteToRelationship, triageAll, triageKeep, untriage } from '../../db.js';
import { RELATIONSHIP_TYPES, directedByDefault, live } from '../../model.js';
import { plain } from '../../mentions.js';
import { href } from '../router.js';
import { NoteItem } from '../NoteItem.js';
import { Confirm } from '../fields.js';
import { formatDay } from '../format.js';
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
            <${InboxNote} key=${n.id} note=${n} names=${names} entities=${entities} pcId=${pcId} onMessage=${onMessage}
              onKeep=${() => run(() => triageKeep(n.id))}
              onToEntity=${(e) => run(() => promoteNote(n.id, { entityId: e.id }, textOf(n)), `Added to ${e.name}’s description.`)}
              onToCharacter=${(section, label) => run(() => promoteNote(n.id, { entityId: pcId, section }, textOf(n)), `Added to your ${label}.`)}
              onToRelationship=${(rel) => run(() => promoteNoteToRelationship(n.id, rel, textOf(n)),
                `Relationship added: ${names.get(rel.from_id)} ${rel.type} ${names.get(rel.to_id)}.`)} />`)}
          </ul>`
        : html`<p class="muted">All sorted. New notes land here.</p>`)}

      ${showSorted && (sorted.length
        ? html`<ul class="inbox__list">${sorted.map((n) => html`
            <${NoteItem} key=${n.id} note=${n} names=${names} onMessage=${onMessage}>
              <button type="button" class="btn" onClick=${() => run(() => untriage(n.id))}>Back to inbox</button>
              ${n.promoted_to?.length > 0 && html`<span class="muted inbox__added">Added to ${n.promoted_to.map((id) => names.get(id) ?? '?').join(', ')}</span>`}
            </${NoteItem}>`)}
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

function InboxNote({ note, names, entities, pcId, onKeep, onToEntity, onToCharacter, onToRelationship, onMessage }) {
  const [relForm, setRelForm] = useState(false);
  const mentioned = note.mentions
    .filter((id) => id !== pcId)
    .map((id) => entities.find((e) => e.id === id))
    .filter(Boolean);
  return html`
    <${NoteItem} note=${note} names=${names} onMessage=${onMessage}
      extra=${relForm && html`<${RelationshipFromNote} names=${names} pcId=${pcId} mentioned=${mentioned}
        onCancel=${() => setRelForm(false)}
        onAdd=${(rel) => { setRelForm(false); onToRelationship(rel); }} />`}>
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
      ${mentioned.length > 0 && !relForm && html`
        <button type="button" class="btn" onClick=${() => setRelForm(true)}>Add as relationship…</button>`}
    </${NoteItem}>
  `;
}

// Small form under a note: from / type / to, from your character and the
// entities the note mentions. Direction follows the type (as on entity pages).
function RelationshipFromNote({ names, pcId, mentioned, onAdd, onCancel }) {
  const people = [pcId, ...mentioned.map((e) => e.id)].filter((id, i, a) => id && a.indexOf(id) === i);
  const [from, setFrom] = useState(pcId);
  const [to, setTo] = useState(mentioned[0]?.id);
  const [type, setType] = useState('');
  const pick = (value, set, label) => html`
    <select class="input" aria-label=${label} value=${value} onChange=${(e) => set(e.currentTarget.value)}>
      ${people.map((id) => html`<option value=${id}>${names.get(id)}</option>`)}
    </select>`;
  const submit = (e) => {
    e.preventDefault();
    if (!type.trim()) return;
    if (from === to) return;
    onAdd({ from_id: from, to_id: to, type: type.trim(), directed: directedByDefault(type) });
  };
  return html`
    <form class="rels__form inbox__relform" onSubmit=${submit} aria-label="Add as relationship">
      ${pick(from, setFrom, 'From')}
      <input class="input" aria-label="Relationship type" placeholder="Type, e.g. owes" list="inbox-rel-types"
        value=${type} onInput=${(e) => setType(e.currentTarget.value)} />
      <datalist id="inbox-rel-types">${RELATIONSHIP_TYPES.map(([t]) => html`<option value=${t} />`)}</datalist>
      ${pick(to, setTo, 'To')}
      <button type="submit" class="btn btn--primary" disabled=${!type.trim() || from === to}>Add</button>
      <button type="button" class="btn" onClick=${onCancel}>Cancel</button>
    </form>
  `;
}
