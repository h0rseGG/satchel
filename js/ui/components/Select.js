import { useId } from 'preact/hooks';
import { html } from '../html.js';

// options: [{ value, label }]. A native select: the phone shows its own picker.
export function Select({ label, value, options, onChange, hideLabel = false }) {
  const id = useId();
  return html`
    <div class="field select-field">
      <label class=${hideLabel ? 'field-label sr-only' : 'field-label'} for=${id}>${label}</label>
      <select id=${id} class="select-input" value=${value} onChange=${(e) => onChange?.(e.currentTarget.value)}>
        ${options.map((o) => html`<option value=${o.value} key=${o.value}>${o.label}</option>`)}
      </select>
    </div>`;
}
