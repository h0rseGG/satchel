import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { updateType, addField, renameField, removeField, deleteType } from '../../data/types.js';
import { activeFields, FIELD_KINDS } from '../../core/types.js';
import { Field } from '../components/Field.js';
import { Select } from '../components/Select.js';
import { Button } from '../components/Button.js';
import { InlineForm } from '../components/InlineForm.js';
import { confirmSheet } from '../app/confirm.js';
import { toast, reportError } from '../app/toasts.js';
import { lower, typeCount } from '../format.js';

// One type in "Manage types": rename in place, its fields, delete (custom only).
export function TypeManager({ type, types, count }) {
  const [open, setOpen] = useState(false);
  const fields = activeFields(type);
  return html`
    <li class="list-row type-row">
      <div class="list-row-main">
        <span class="list-row-title">${type.label} <span class="muted">/ ${type.plural}</span></span>
        <span class="list-row-meta">${fields.length ? fields.map((f) => f.label).join(', ') : ''}</span>
        <${Button} variant="quiet" class="type-row-edit" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>${open ? S.world.done : S.world.edit}<//>
      </div>
      ${open && html`<${TypeEditor} type=${type} types=${types} count=${count} fields=${fields} />`}
    </li>`;
}

function TypeEditor({ type, types, count, fields }) {
  const [adding, setAdding] = useState(false);
  const others = types.filter((t) => t.id !== type.id);
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '');
  const save = (patch) => updateType(type.id, patch).catch(reportError);

  const del = async () => {
    const target = others.find((t) => t.id === moveTo);
    const ok = await confirmSheet({
      title: S.world.confirmDeleteType(type.label),
      body: S.world.confirmDeleteTypeBody(count ? typeCount(count, type) : 0, target?.plural),
      confirmLabel: S.common.delete,
    });
    if (!ok) return;
    try {
      await deleteType(type.id, { moveTo: count ? moveTo : null });
      toast(S.world.typeDeleted(type.label), { kind: 'ok' });
    } catch (err) {
      reportError(err);
    }
  };

  return html`
    <div class="type-editor">
      <div class="type-editor-names">
        <${Field} label=${S.world.typeLabel} value=${type.label} onSave=${(v) => v.trim() && save({ label: v.trim() })} />
        <${Field} label=${S.world.typePlural} value=${type.plural} onSave=${(v) => v.trim() && save({ plural: v.trim() })} />
      </div>
      <label class="check"><input type="checkbox" checked=${!!type.person} onChange=${(e) => save({ person: e.currentTarget.checked })} /> ${S.world.person}</label>

      <h3 class="type-editor-head">${S.world.fields}</h3>
      ${fields.length === 0 && html`<p class="muted">${S.world.noFields}</p>`}
      ${fields.map((f) => html`
        <div class="field-def" key=${f.id}>
          <${Field} label=${`${S.world.kinds[f.kind]}${f.kind === 'link' && f.link_type ? ` → ${types.find((t) => t.id === f.link_type)?.label ?? ''}` : ''}`} value=${f.label} onSave=${(v) => v.trim() && renameField(type.id, f.id, v).catch(reportError)} />
          <${Button} variant="quiet" aria-label=${S.world.removeField(f.label)} onClick=${() => removeField(type.id, f.id).catch(reportError)}>${S.world.remove}<//>
        </div>`)}
      ${adding ? html`<${AddField} type=${type} types=${types} onDone=${() => setAdding(false)} />` : html`<${Button} variant="secondary" onClick=${() => setAdding(true)}>${S.world.addField}<//>`}

      <div class="type-editor-danger">
        ${type.builtin ? html`<p class="muted">${S.world.builtin}</p>` : html`
          ${count > 0 && html`<${Select} label=${S.world.moveTo(typeCount(count, type))} value=${moveTo} onChange=${setMoveTo} options=${others.map((t) => ({ value: t.id, label: t.label }))} />`}
          <${Button} variant="danger" onClick=${del}>${S.world.deleteType}<//>`}
      </div>
    </div>`;
}

function AddField({ type, types, onDone }) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('text');
  const [linkType, setLinkType] = useState('');
  const save = () => addField(type.id, { label: label.trim(), kind, link_type: linkType || null }).then(onDone, reportError);
  return html`
    <${InlineForm} label=${S.world.addField} onSave=${save} onCancel=${onDone} canSave=${!!label.trim()}>
      <label class="field"><span class="field-label">${S.world.fieldLabel}</span><input class="field-input" value=${label} onInput=${(e) => setLabel(e.currentTarget.value)} /></label>
      <div class="row-wrap">
        <${Select} label=${S.world.fieldKind} value=${kind} onChange=${setKind} options=${FIELD_KINDS.map((k) => ({ value: k, label: S.world.kinds[k] }))} />
        ${kind === 'link' && html`<${Select} label=${S.world.linkTo} value=${linkType} onChange=${setLinkType} options=${[{ value: '', label: S.world.anyType }, ...types.map((t) => ({ value: t.id, label: lower(t.plural) }))]} />`}
      </div>
    <//>`;
}
