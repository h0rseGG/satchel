import { useState, useEffect } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { subscribeConfirm } from './confirm.js';
import { Sheet } from '../components/Sheet.js';
import { Button } from '../components/Button.js';
import { key } from '../../core/text.js';

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  const [typed, setTyped] = useState('');
  useEffect(() => subscribeConfirm((r) => { setReq(r); setTyped(''); }), []);
  if (!req) return null;
  const ok = !req.typeName || key(typed) === key(req.typeName);
  const submit = (e) => { e.preventDefault(); if (ok) req.resolve(true); };
  return html`
    <${Sheet} title=${req.title} onClose=${() => req.resolve(false)}>
      <form onSubmit=${submit}>
        ${req.body && html`<p class="sheet-text">${req.body}</p>`}
        ${req.typeName && html`
          <label class="field">
            <span class="field-label">${S.common.typeToConfirm(req.typeName)}</span>
            <input class="field-input" value=${typed} onInput=${(e) => setTyped(e.currentTarget.value)} autocomplete="off" />
          </label>`}
        <div class="sheet-actions">
          <${Button} type="submit" variant="danger-fill" disabled=${!ok}>${req.confirmLabel ?? S.common.confirm}<//>
          <${Button} variant="quiet" onClick=${() => req.resolve(false)}>${S.common.cancel}<//>
        </div>
      </form>
    <//>`;
}
