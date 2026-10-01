import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from './html.js';

const SAVE_AFTER_MS = 700;

// A labelled text field that saves itself: after a short pause in typing,
// and when you leave the field. While you're typing, updates from elsewhere
// (another tab, a sync) don't overwrite your text.
// onSave(value) may throw; the message is shown under the field and the
// stored value is restored.
export function TextField({ id, label, value, onSave, multiline = false, hint = '', placeholder = '' }) {
  const [text, setText] = useState(value ?? '');
  const [error, setError] = useState('');
  const focused = useRef(false);
  const timer = useRef(null);
  const ref = useRef(null);

  useEffect(() => { if (!focused.current) setText(value ?? ''); }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Multi-line fields grow with their content.
  useEffect(() => {
    if (!multiline || !ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight + 2}px`;
  }, [text, multiline]);

  async function commit(v) {
    clearTimeout(timer.current);
    if (v === (value ?? '')) return;
    try {
      await onSave(v);
      setError('');
    } catch (err) {
      setError(err.message);
      setText(value ?? '');
    }
  }

  const common = {
    id, ref, value: text, placeholder,
    class: `input field__input${multiline ? ' field__area' : ''}`,
    onFocus: () => { focused.current = true; },
    onBlur: () => { focused.current = false; commit(text); },
    onInput: (e) => {
      const v = e.currentTarget.value;
      setText(v);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => commit(v), SAVE_AFTER_MS);
    },
  };

  return html`
    <div class="field">
      <label for=${id}>${label}</label>
      ${multiline ? html`<textarea rows="3" ...${common}></textarea>` : html`<input ...${common} />`}
      ${hint && html`<p class="muted field__hint">${hint}</p>`}
      ${error && html`<p class="badge badge--err field__error" role="alert">${error}</p>`}
    </div>
  `;
}

// Chips with a remove button each, plus a box to add more (Enter or comma).
// Backspace in an empty box removes the last chip.
export function ChipsField({ id, label, values, onSave, placeholder = 'Add…', hint = '' }) {
  const [input, setInput] = useState('');
  const list = values ?? [];

  function add(raw) {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) onSave([...list, ...parts]);
    setInput('');
  }

  return html`
    <div class="field">
      <label for=${id}>${label}</label>
      <div class="chips">
        ${list.map((v, i) => html`
          <span class="chip" key=${v}>
            ${v}
            <button type="button" class="chip__x" aria-label=${`Remove ${v}`}
              onClick=${() => onSave(list.filter((_, j) => j !== i))}>×</button>
          </span>
        `)}
        <input id=${id} class="input chips__input" value=${input} placeholder=${placeholder}
          onInput=${(e) => {
            const v = e.currentTarget.value;
            if (v.includes(',')) add(v); else setInput(v);
          }}
          onKeyDown=${(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(input); }
            if (e.key === 'Backspace' && !input && list.length) onSave(list.slice(0, -1));
          }}
          onBlur=${() => input.trim() && add(input)} />
      </div>
      ${hint && html`<p class="muted field__hint">${hint}</p>`}
    </div>
  `;
}

// A simple yes/no dialog.
export function Confirm({ title, children, action, danger = false, onConfirm, onCancel }) {
  return html`
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && onCancel()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-label=${title}>
        <h2 class="dialog__title">${title}</h2>
        ${children}
        <div class="row dialog__actions">
          <button type="button" class=${`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick=${onConfirm}>${action}</button>
          <button type="button" class="btn" onClick=${onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  `;
}
