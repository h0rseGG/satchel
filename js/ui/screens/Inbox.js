import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { useCapture } from '../useCapture.js';
import { inboxNotes, sortedNotes, keepAsLog, backToInbox, addToEntity, addToProfile, addAsRelationship } from '../../data/inbox.js';
import { PROFILE_SECTIONS } from '../../core/model.js';
import { SUGGESTED } from '../../core/relationships.js';
import { NoteRow } from '../components/NoteRow.js';
import { RuledList } from '../components/ListRow.js';
import { Button } from '../components/Button.js';
import { Select } from '../components/Select.js';
import { InlineForm } from '../components/InlineForm.js';
import { EntityPicker } from '../components/EntityPicker.js';
import { toast, reportError } from '../app/toasts.js';
import { createEntity } from '../../data/entities.js';

const MODES = ['all', 'in', 'out'];

// Unsorted notes, oldest first, and what to do with each (SPEC 5.2).
export function Inbox({ pc }) {
  const cap = useCapture();
  const [mode, setMode] = useState('all');
  const [showSorted, setShowSorted] = useState(false);
  const notes = useLive(() => inboxNotes(mode), [mode], []);
  const sorted = useLive(() => (showSorted ? sortedNotes(mode) : []), [mode, showSorted], []);
  const run = (p, msg) => p.then(() => msg && toast(msg, { kind: 'ok', ms: 3000 }), reportError);

  return html`
    <div class="page-head">
      <h1 class="page-title">${S.inbox.title}</h1>
      ${notes.length > 0 && html`<${Button} variant="secondary" onClick=${() => run(keepAsLog(notes.map((n) => n.id)), S.inbox.kept(notes.length))}>${S.inbox.markAll}<//>`}
    </div>
    <div class="segmented" role="group" aria-label=${S.inbox.filter}>
      ${MODES.map((m) => html`<button type="button" key=${m} class=${`segmented-btn${mode === m ? ' is-on' : ''}`} aria-pressed=${mode === m ? 'true' : 'false'} onClick=${() => setMode(m)}>${S.inbox[m]}</button>`)}
    </div>
    ${notes.length === 0 ? html`<p class="empty-line">${S.inbox.empty}</p>` : html`
      <${RuledList} label=${S.inbox.title}>
        ${notes.map((n) => html`<${InboxItem} key=${n.id} note=${n} cap=${cap} pc=${pc} run=${run} />`)}
      <//>`}
    <div class="sorted-toggle">
      <${Button} variant="quiet" aria-expanded=${showSorted ? 'true' : 'false'} onClick=${() => setShowSorted(!showSorted)}>${showSorted ? S.inbox.hideSorted : S.inbox.showSorted}<//>
    </div>
    ${showSorted && html`
      <h2 class="section-title">${S.inbox.sortedTitle}</h2>
      <${RuledList} label=${S.inbox.sortedTitle}>
        ${sorted.map((n) => html`<${NoteRow} key=${n.id} note=${n} cap=${cap} pcId=${pc.id} actions=${html`<${Button} variant="quiet" onClick=${() => run(backToInbox(n.id))}>${S.inbox.back}<//>`} />`)}
      <//>`}`;
}

function InboxItem({ note, cap, pc, run }) {
  const [open, setOpen] = useState(null); // 'profile' | 'rel'
  const mentioned = cap ? note.mentions.map((id) => cap.byId.get(id)).filter((e) => e && !e.deleted && e.id !== pc.id) : [];
  const actions = html`
    <${Button} variant="quiet" onClick=${() => run(keepAsLog([note.id]))}>${S.inbox.keep}<//>
    ${mentioned.map((e) => html`<${Button} variant="quiet" key=${e.id} onClick=${() => run(addToEntity(note.id, e.id), S.inbox.added(e.name))}>${S.inbox.addTo(e.name)}<//>`)}
    <${Button} variant="quiet" aria-expanded=${open === 'profile' ? 'true' : 'false'} onClick=${() => setOpen(open === 'profile' ? null : 'profile')}>${S.inbox.addToMe}<//>
    <${Button} variant="quiet" aria-expanded=${open === 'rel' ? 'true' : 'false'} onClick=${() => setOpen(open === 'rel' ? null : 'rel')}>${S.inbox.addRel}<//>`;
  return html`
    <${NoteRow} note=${note} cap=${cap} pcId=${pc.id} actions=${actions}>
      ${open === 'profile' && html`<${ProfileForm} note=${note} pc=${pc} run=${run} onDone=${() => setOpen(null)} />`}
      ${open === 'rel' && cap && html`<${RelationshipForm} note=${note} pc=${pc} cap=${cap} mentioned=${mentioned} run=${run} onDone=${() => setOpen(null)} />`}
    <//>`;
}

function ProfileForm({ note, pc, run, onDone }) {
  const [section, setSection] = useState('notes');
  return html`
    <${InlineForm} label=${S.inbox.addToMe} onSave=${() => run(addToProfile(note.id, section), S.inbox.added(S.overview.sections[section])).then(onDone)} onCancel=${onDone}>
      <${Select} label=${S.inbox.section} value=${section} onChange=${setSection} options=${PROFILE_SECTIONS.map((s) => ({ value: s, label: S.overview.sections[s] }))} />
    <//>`;
}

// Who (you or someone mentioned), how (a suggested type or your own words), with whom.
function RelationshipForm({ note, pc, cap, mentioned, run, onDone }) {
  const people = [pc, ...mentioned];
  const [from, setFrom] = useState(mentioned[0]?.id ?? pc.id);
  const [type, setType] = useState('ally');
  const [other, setOther] = useState('');
  const [to, setTo] = useState(null);
  const finalType = type === '' ? other.trim() : type;
  const save = () => run(addAsRelationship(note.id, { from_id: from, to_id: to.id, type: finalType }), S.inbox.relAdded).then(onDone);
  const typeLabel = (id) => cap.typesById.get(id)?.label ?? '';
  return html`
    <${InlineForm} label=${S.inbox.addRel} onSave=${save} onCancel=${onDone} canSave=${!!to && !!finalType && to.id !== from}>
      <div class="row-wrap">
        <${Select} label=${S.inbox.relFrom} value=${from} onChange=${setFrom} options=${people.map((e) => ({ value: e.id, label: e.name }))} />
        <${Select} label=${S.inbox.relType} value=${type} onChange=${setType} options=${[...SUGGESTED.map(([t]) => ({ value: t, label: t })), { value: '', label: S.inbox.relOther }]} />
      </div>
      ${type === '' && html`<label class="field"><span class="field-label">${S.inbox.relOtherLabel}</span><input class="field-input" value=${other} onInput=${(e) => setOther(e.currentTarget.value)} /></label>`}
      ${to ? html`<p class="rel-preview"><strong>${people.find((p) => p.id === from)?.name}</strong> ${finalType} <strong>${to.name}</strong> <${Button} variant="quiet" onClick=${() => setTo(null)}>${S.entity.change}<//></p>`
        : html`<${EntityPicker} label=${S.inbox.relWith} entities=${cap.entities.filter((e) => e.id !== from)} typeLabel=${typeLabel} onPick=${setTo} onCreate=${async (name) => setTo(await createEntity({ name, stub: true, type_id: null }))} limit=${6} />`}
    <//>`;
}
