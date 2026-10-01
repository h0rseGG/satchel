import { useState, useEffect } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { href } from '../app/router.js';
import { getEntity } from '../../data/frame.js';
import { allEntities, updateEntity, createEntity, deleteEntity, mergeEntity, notesMentioning } from '../../data/entities.js';
import { allTypes } from '../../data/types.js';
import { Field } from '../components/Field.js';
import { ChipsField } from '../components/ChipsField.js';
import { Select } from '../components/Select.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { EntityPicker } from '../components/EntityPicker.js';
import { RuledList, ListRow } from '../components/ListRow.js';
import { NoteText } from '../components/NoteText.js';
import { EntityFields } from './EntityFields.js';
import { NotBuilt } from './NotBuilt.js';
import { confirmSheet } from '../app/confirm.js';
import { toast, reportError } from '../app/toasts.js';
import { when } from '../format.js';

// One entity, edited in place (SPEC 5.2, 5.3). Relationships and files join in M7 and M8.
export function Entity({ id, pcId }) {
  const entity = useLive(() => getEntity(id), [id], undefined);
  const types = useLive(allTypes, [], []);
  const entities = useLive(allEntities, [], []);
  const notes = useLive(() => notesMentioning(id), [id], []);
  const [merging, setMerging] = useState(false);

  // A merged entity lives on in its survivor: follow the redirect.
  useEffect(() => {
    if (entity?.deleted && entity.merged_into) location.replace(href('entity', { id: entity.merged_into }));
  }, [entity?.deleted, entity?.merged_into]);

  if (entity === undefined) return null;
  if (!entity || entity.deleted) return html`<${NotBuilt} title=${entity?.name ?? S.nav.notFound} />`;

  const live = entities.filter((e) => !e.deleted);
  const byId = new Map(entities.map((e) => [e.id, e]));
  const type = types.find((t) => t.id === entity.type_id) ?? null;
  const typeLabel = (tid) => types.find((t) => t.id === tid)?.label ?? '';
  const save = (patch) => updateEntity(id, patch).catch(reportError);
  const isPc = id === pcId;

  const setType = (tid) => save(tid ? { type_id: tid, stub: false } : { type_id: null, stub: true });
  const createStub = (name) => createEntity({ name, stub: true, type_id: null });

  const merge = async (target) => {
    setMerging(false);
    const ok = await confirmSheet({ title: S.entity.confirmMerge(entity.name, target.name), body: S.entity.confirmMergeBody(entity.name, target.name), confirmLabel: 'Merge' });
    if (!ok) return;
    try {
      await mergeEntity(id, target.id);
      toast(S.entity.merged(entity.name, target.name), { kind: 'ok' });
    } catch (err) {
      reportError(err);
    }
  };

  const del = async () => {
    const ok = await confirmSheet({ title: S.entity.confirmDelete(entity.name), body: S.entity.confirmDeleteBody, confirmLabel: S.common.delete });
    if (!ok) return;
    try {
      await deleteEntity(id);
      toast(S.entity.deleted(entity.name), { kind: 'ok' });
      location.hash = entity.type_id ? href('type', { typeId: entity.type_id }) : href('stubs');
    } catch (err) {
      reportError(err);
    }
  };

  return html`
    <h1 class="page-title">${entity.name}</h1>
    ${isPc && html`<p class="muted">${S.entity.pcHint}</p>`}
    <${Panel}>
      <${Field} label=${S.entity.name} value=${entity.name} onSave=${(v) => v.trim() && save({ name: v.trim() })} />
      ${!isPc && html`<${Select} label=${S.entity.type} value=${entity.type_id ?? ''} onChange=${setType} options=${[...(entity.stub || !entity.type_id ? [{ value: '', label: S.entity.stubType }] : []), ...types.map((t) => ({ value: t.id, label: t.label }))]} />`}
      <${Field} label=${S.entity.summary} value=${entity.summary} onSave=${(v) => save({ summary: v.trim() })} />
      <${ChipsField} label=${S.entity.tags} values=${entity.tags || []} onSave=${(v) => save({ tags: v })} />
      <${ChipsField} label=${S.entity.aliases} values=${entity.aliases || []} onSave=${(v) => save({ aliases: v })} />
      <${EntityFields} entity=${entity} type=${type} entities=${live} typeLabel=${typeLabel} save=${save} createStub=${createStub} />
      <${Field} label=${S.entity.body} value=${entity.body} multiline rows=${6} onSave=${(v) => save({ body: v })} />
    <//>

    <${Panel} title=${S.entity.notes} titleId="entity-notes">
      ${notes.length === 0 ? html`<p class="muted">${S.entity.noNotes}</p>` : html`
        <${RuledList} label=${S.entity.notes}>
          ${notes.map((n) => html`<${ListRow} key=${n.id} title=${html`<${NoteText} text=${n.text} byId=${byId} />`} meta=${when(n.created_at)} />`)}
        <//>`}
    <//>

    ${!isPc && html`
      <div class="entity-actions">
        ${merging
          ? html`<div class="inline-form"><${EntityPicker} label=${S.entity.mergeLabel} entities=${live.filter((e) => e.id !== id)} typeLabel=${typeLabel} onPick=${merge} autofocus /><${Button} variant="quiet" onClick=${() => setMerging(false)}>${S.common.cancel}<//></div>`
          : html`<${Button} variant="secondary" onClick=${() => setMerging(true)}>${S.entity.merge}<//>`}
        <${Button} variant="danger" onClick=${del}>${S.entity.delete}<//>
      </div>`}`;
}
