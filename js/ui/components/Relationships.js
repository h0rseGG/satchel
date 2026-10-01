import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { href } from '../app/router.js';
import { relationshipsOf, createRelationship, deleteRelationship, updateRelationship } from '../../data/relationships.js';
import { createEntity } from '../../data/entities.js';
import { SUGGESTED, isDirected, sentence, bothWays } from '../../core/relationships.js';
import { Panel } from './Panel.js';
import { RuledList } from './ListRow.js';
import { Button } from './Button.js';
import { Select } from './Select.js';
import { Field } from './Field.js';
import { InlineForm } from './InlineForm.js';
import { EntityPicker } from './EntityPicker.js';
import { Connections } from './Connections.js';
import { confirmSheet } from '../app/confirm.js';
import { toast, reportError } from '../app/toasts.js';

// An entity's relationships as sentences, with the diagram and an inline add (SPEC 3.5, M7).
export function Relationships({ entity, entities, typeLabel }) {
  const rels = useLive(() => relationshipsOf(entity.id), [entity.id], []);
  const [adding, setAdding] = useState(false);
  const byId = new Map(entities.map((e) => [e.id, e]));
  return html`
    <${Panel} title=${S.rel.title} titleId="rels" action=${!adding && html`<${Button} variant="quiet" onClick=${() => setAdding(true)}>${S.rel.add}<//>`}>
      ${adding && html`<${AddRelationship} entity=${entity} entities=${entities} typeLabel=${typeLabel} onDone=${() => setAdding(false)} />`}
      ${rels.length === 0 ? !adding && html`<p class="muted">${S.rel.none}</p>` : html`
        <${RuledList} label=${S.rel.title}>
          ${rels.map((r) => html`<${RelRow} key=${r.id} rel=${r} byId=${byId} selfId=${entity.id} />`)}
        <//>
        <${Connections} entity=${entity} rels=${rels} byId=${byId} />`}
    <//>`;
}

function Name({ e, selfId }) {
  return e.id === selfId ? html`<strong>${e.name}</strong>` : html`<a class="rel-name" href=${href('entity', { id: e.id })}><strong>${e.name}</strong></a>`;
}

function RelRow({ rel, byId, selfId }) {
  const [open, setOpen] = useState(false);
  const a = byId.get(rel.from_id);
  const b = byId.get(rel.to_id);
  if (!a || !b) return null;
  const plain = sentence(rel, (id) => byId.get(id).name);
  const del = async () => {
    if (!(await confirmSheet({ title: S.rel.confirmDelete(plain), body: S.rel.confirmDeleteBody, confirmLabel: S.common.delete }))) return;
    deleteRelationship(rel.id).then(() => toast(S.rel.deleted, { kind: 'ok' }), reportError);
  };
  return html`
    <li class="list-row rel-row">
      <div class="list-row-main">
        <span class="list-row-title">${isDirected(rel)
          ? html`<${Name} e=${a} selfId=${selfId} /> ${rel.type} <${Name} e=${b} selfId=${selfId} />`
          : html`<${Name} e=${a} selfId=${selfId} /> and <${Name} e=${b} selfId=${selfId} /> are ${bothWays(rel.type)}`}</span>
        <span class="note-row-manage">
          <button type="button" class="note-link" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>${S.rel.notes}</button>
          <button type="button" class="note-link note-link-danger" onClick=${del}>${S.rel.delete}</button>
        </span>
      </div>
      ${rel.notes && !open && html`<div class="list-row-detail">${rel.notes}</div>`}
      ${open && html`<${Field} label=${S.rel.notesLabel(plain)} value=${rel.notes} multiline rows=${2} onSave=${(v) => updateRelationship(rel.id, { notes: v }).catch(reportError)} />`}
    </li>`;
}

// "<this> [type] <with>", with a swap for one-way types; new names make stubs.
function AddRelationship({ entity, entities, typeLabel, onDone }) {
  const [type, setType] = useState('ally');
  const [other, setOther] = useState('');
  const [to, setTo] = useState(null);
  const [swapped, setSwapped] = useState(false);
  const finalType = (type === '' ? other : type).trim().toLowerCase();
  const directed = finalType ? isDirected({ type: finalType }) : true;
  const [from, target] = swapped && directed ? [to, entity] : [entity, to];
  const save = () => createRelationship({ from_id: from.id, to_id: target.id, type: finalType }).then(() => { toast(S.rel.added, { kind: 'ok', ms: 3000 }); onDone(); }, reportError);
  return html`
    <${InlineForm} label=${S.rel.add} onSave=${save} onCancel=${onDone} canSave=${!!to && !!finalType}>
      <${Select} label=${S.rel.type} value=${type} onChange=${setType} options=${[...SUGGESTED.map(([t]) => ({ value: t, label: t })), { value: '', label: S.rel.other }]} />
      ${type === '' && html`<label class="field"><span class="field-label">${S.rel.otherLabel}</span><input class="field-input" value=${other} onInput=${(e) => setOther(e.currentTarget.value)} /></label>`}
      ${to ? html`
        <p class="rel-preview">${directed ? html`<strong>${from.name}</strong> ${finalType} <strong>${target.name}</strong>` : html`<strong>${entity.name}</strong> and <strong>${to.name}</strong> are ${bothWays(finalType)}`}
          ${directed && html` <${Button} variant="quiet" onClick=${() => setSwapped(!swapped)}>${S.rel.swap}<//>`}
          <${Button} variant="quiet" onClick=${() => setTo(null)}>${S.entity.change}<//></p>`
        : html`<${EntityPicker} label=${S.rel.with} entities=${entities.filter((e) => e.id !== entity.id && !e.deleted)} typeLabel=${typeLabel} onPick=${setTo} onCreate=${async (name) => setTo(await createEntity({ name, stub: true, type_id: null }))} limit=${6} />`}
    <//>`;
}
