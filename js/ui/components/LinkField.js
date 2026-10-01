import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { href } from '../app/router.js';
import { Button } from './Button.js';
import { EntityPicker } from './EntityPicker.js';

// A link field: shows the linked entity, or the one entity picker to choose it.
// A new name typed in the picker becomes a stub (SPEC 5.3 rule 4).
export function LinkField({ label, value, linkType, entities, typeLabel, onSave, onCreateStub, exclude = [] }) {
  const [picking, setPicking] = useState(false);
  const linked = value ? entities.find((e) => e.id === value) : null;
  const pool = linkType ? entities.filter((e) => e.type_id === linkType || e.stub) : entities;
  const done = (id) => { setPicking(false); onSave(id); };

  if (picking || !linked) {
    return html`
      <div class="field link-field">
        <${EntityPicker} label=${label} entities=${pool} exclude=${exclude} typeLabel=${typeLabel} onPick=${(e) => done(e.id)} onCreate=${async (name) => done((await onCreateStub(name)).id)} limit=${6} />
        ${picking && html`<${Button} variant="quiet" onClick=${() => setPicking(false)}>${S.common.cancel}<//>`}
      </div>`;
  }
  return html`
    <div class="field link-field">
      <span class="field-label">${label}</span>
      <div class="row-wrap">
        <a class="mention" href=${href('entity', { id: linked.id })}>${linked.name}</a>
        <${Button} variant="quiet" onClick=${() => setPicking(true)}>${S.entity.change}<//>
        <${Button} variant="quiet" onClick=${() => onSave('')}>${S.entity.clear}<//>
      </div>
    </div>`;
}
