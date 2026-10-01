import { useState, useMemo } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { href } from '../app/router.js';
import { entitiesOfType, createEntity, updateEntity } from '../../data/entities.js';
import { getType, allTypes } from '../../data/types.js';
import { activeFields } from '../../core/types.js';
import { key } from '../../core/text.js';
import { RuledList, ListRow } from '../components/ListRow.js';
import { Button } from '../components/Button.js';
import { InlineForm } from '../components/InlineForm.js';
import { Select } from '../components/Select.js';
import { NotBuilt } from './NotBuilt.js';
import { reportError, toast } from '../app/toasts.js';
import { lower } from '../format.js';

// A–Z list of one type, or of stubs (typeId null), with a filter and "Add" (SPEC 5.2).
export function TypeList({ typeId, pcId }) {
  const type = useLive(() => (typeId ? getType(typeId) : null), [typeId], undefined);
  const list = useLive(() => entitiesOfType(typeId), [typeId], []);
  const types = useLive(allTypes, [], []);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const stubs = typeId == null;

  const shown = useMemo(() => {
    const k = key(q);
    const fields = activeFields(type).filter((f) => f.kind !== 'link');
    return list.filter((e) => e.id !== pcId).filter((e) => !k || [e.name, ...(e.aliases || []), ...(e.tags || []), ...fields.map((f) => e.fields?.[f.id] ?? '')].some((v) => key(v).includes(k)));
  }, [list, q, type, pcId]);

  if (!stubs && type === undefined) return null;
  if (!stubs && (!type || type.deleted)) return html`<${NotBuilt} title=${S.nav.notFound} />`;
  const title = stubs ? S.world.stubs : type.plural;

  return html`
    <div class="page-head">
      <h1 class="page-title">${title}</h1>
      ${!stubs && !adding && html`<${Button} variant="primary" onClick=${() => setAdding(true)}>${S.typeList.add(lower(type.label))}<//>`}
    </div>
    ${stubs && html`<p class="muted">${S.world.stubsHint}</p>`}
    ${adding && html`<${AddEntity} type=${type} onDone=${() => setAdding(false)} />`}
    ${list.length > 0 && html`<label class="field filter-field"><span class="sr-only">${S.typeList.filter}</span><input class="field-input" type="search" value=${q} placeholder=${S.typeList.filter} onInput=${(e) => setQ(e.currentTarget.value)} /></label>`}
    ${list.length === 0 ? html`<p class="muted">${S.typeList.none}</p>` : shown.length === 0 ? html`<p class="muted">${S.typeList.noMatch}</p>` : html`
      <${RuledList} label=${title}>
        ${shown.map((e) => html`<${ListRow} key=${e.id} title=${e.name} href=${href('entity', { id: e.id })}
          meta=${stubs ? html`<${QuickType} entity=${e} types=${types} />` : e.tags?.length ? e.tags.join(', ') : ''} detail=${e.summary || (e.aliases?.length ? e.aliases.join(', ') : '')} />`)}
      <//>`}`;
}

function AddEntity({ type, onDone }) {
  const [name, setName] = useState('');
  const save = async () => {
    try {
      const e = await createEntity({ name: name.trim(), type_id: type.id });
      onDone();
      location.hash = href('entity', { id: e.id });
    } catch (err) {
      reportError(err);
    }
  };
  return html`
    <${InlineForm} label=${S.typeList.add(lower(type.label))} onSave=${save} onCancel=${onDone} canSave=${!!name.trim()}>
      <label class="field"><span class="field-label">${S.typeList.name}</span><input class="field-input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} autofocus /></label>
    <//>`;
}

function QuickType({ entity, types }) {
  const set = (id) => {
    const t = types.find((x) => x.id === id);
    if (!t) return;
    updateEntity(entity.id, { type_id: id, stub: false }).then(() => toast(S.recall.typeSet(entity.name, t.label), { kind: 'ok' }), reportError);
  };
  return html`<${Select} label=${S.typeList.setType} hideLabel value="" onChange=${set} options=${[{ value: '', label: S.typeList.chooseType }, ...types.map((t) => ({ value: t.id, label: t.label }))]} />`;
}
