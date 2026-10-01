import { useState, useId } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { key } from '../../core/text.js';

// A list of short values (tags, aliases). Enter or comma adds; × removes.
// Duplicates that differ only in case are ignored.
export function ChipsField({ label, values = [], onSave, placeholder }) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.replace(/,/g, ' ').trim();
    setDraft('');
    if (!v || values.some((x) => key(x) === key(v))) return;
    onSave?.([...values, v]);
  };
  const remove = (v) => onSave?.(values.filter((x) => x !== v));
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    }
  };

  return html`
    <div class="field chips-field">
      <label class="field-label" for=${id}>${label}</label>
      <div class="chips-box">
        ${values.map((v) => html`
          <span class="chip" key=${v}>${v}<button type="button" class="chip-remove" aria-label=${S.common.remove(v)} onClick=${() => remove(v)}>×</button></span>`)}
        <input id=${id} class="chips-input" value=${draft} placeholder=${placeholder} onInput=${(e) => setDraft(e.currentTarget.value)} onKeyDown=${onKeyDown} onBlur=${add} />
      </div>
    </div>`;
}
