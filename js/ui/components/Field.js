import { useState, useEffect, useRef, useId } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';

const AUTOSAVE_MS = 700;

// Edit in place (SPEC 5.3 rule 1): saves 0.7 s after typing stops and on leaving the
// field; the same value is a no-op; while focused, outside updates don't overwrite typing.
// validate(value) -> error key | null (see S.errors.invalid).
export function Field({ label, value = '', onSave, multiline = false, inputType = 'text', placeholder, validate, hint, rows = 4, class: cls = '' }) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? '');
  const [error, setError] = useState(null);
  const focused = useRef(false);
  const saved = useRef(value ?? '');
  const timer = useRef(null);

  useEffect(() => {
    saved.current = value ?? '';
    if (!focused.current) setDraft(value ?? '');
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (v) => {
    clearTimeout(timer.current);
    const err = validate ? validate(v) : null;
    setError(err);
    if (err || v === saved.current) return;
    saved.current = v;
    onSave?.(v);
  };

  const onInput = (e) => {
    const v = e.currentTarget.value;
    setDraft(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), AUTOSAVE_MS);
  };
  const onBlur = (e) => {
    focused.current = false;
    commit(e.currentTarget.value);
  };

  const props = {
    id, value: draft, placeholder, onInput, onBlur,
    onFocus: () => { focused.current = true; },
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': error || hint ? `${id}-help` : undefined,
  };
  return html`
    <div class=${`field ${cls}`.trim()}>
      <label class="field-label" for=${id}>${label}</label>
      ${multiline ? html`<textarea class="field-input" rows=${rows} ...${props}></textarea>` : html`<input class="field-input" type=${inputType} ...${props} />`}
      ${(error || hint) && html`<div id=${`${id}-help`} class=${error ? 'field-error' : 'field-hint'}>${error ? S.errors.invalid[error] ?? error : hint}</div>`}
    </div>`;
}
