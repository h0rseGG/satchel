import { html } from '../html.js';
import { S } from '../strings.js';
import { activeFields, fieldValueError } from '../../core/types.js';
import { Field } from '../components/Field.js';
import { LinkField } from '../components/LinkField.js';

// The custom fields of an entity's type, each saved in place.
export function EntityFields({ entity, type, entities, typeLabel, save, createStub }) {
  const fields = activeFields(type);
  if (!fields.length) return null;
  const set = (f) => (v) => save({ fields: { [f.id]: f.kind === 'number' && v !== '' ? String(Number(v)) : v.trim?.() ?? v } });
  return html`
    <div class="entity-fields">
      ${fields.map((f) => {
        const value = entity.fields?.[f.id] ?? '';
        if (f.kind === 'link') return html`<${LinkField} key=${f.id} label=${f.label} value=${value} linkType=${f.link_type} entities=${entities} typeLabel=${typeLabel} exclude=${[entity.id]} onSave=${set(f)} onCreateStub=${createStub} />`;
        const props = { key: f.id, label: f.label, value, onSave: set(f), validate: (v) => fieldValueError(f.kind, v.trim()) };
        if (f.kind === 'long_text') return html`<${Field} ...${props} multiline />`;
        if (f.kind === 'date') return html`<${Field} ...${props} inputType="date" />`;
        if (f.kind === 'number') return html`<${Field} ...${props} inputType="text" />`;
        if (f.kind === 'url') {
          return html`<div class="url-field" key=${f.id}><${Field} ...${props} inputType="url" placeholder="https://" />${value && !fieldValueError('url', value) && html`<a class="btn btn-quiet" href=${value} target="_blank" rel="noopener noreferrer">${S.entity.openLink}</a>`}</div>`;
        }
        return html`<${Field} ...${props} />`;
      })}
    </div>`;
}
