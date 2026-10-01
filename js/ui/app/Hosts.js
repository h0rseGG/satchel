import { useState, useEffect } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { Sheet } from '../components/Sheet.js';
import { Button } from '../components/Button.js';
import { subscribeUnpack } from './unpack.js';
import { when } from '../format.js';

// Unpack kit: what's in it, then Merge (same character) or Replace.
export function UnpackHost({ myName }) {
  const [req, setReq] = useState(null);
  useEffect(() => subscribeUnpack(setReq), []);
  if (!req) return null;
  const packed = req.kit.bundle.exported_at ? when(req.kit.bundle.exported_at) : '?';
  const notes = req.kit.bundle.notes.filter((n) => !n.deleted).length;
  const ents = req.kit.bundle.entities.filter((e) => !e.deleted).length - 1;
  return html`
    <${Sheet} title=${S.kit.unpackTitle(req.fileName)} onClose=${() => req.resolve(null)}>
      <p class="sheet-text">${req.same ? S.kit.sameBody(req.name, packed) : S.kit.otherBody(req.name, packed, myName)}</p>
      <p class="sheet-text muted">${S.kit.counts(notes, ents)}</p>
      <div class="sheet-actions">
        ${req.same && html`<${Button} variant="primary" onClick=${() => req.resolve('merge')}>${S.kit.merge}<//>`}
        <${Button} variant="danger" onClick=${() => req.resolve('replace')}>${S.kit.replace}<//>
        <${Button} variant="quiet" onClick=${() => req.resolve(null)}>${S.common.cancel}<//>
      </div>
    <//>`;
}

// End of session with unsaved changes: offer a kit (not a confirm: nothing is lost).
export function Nudge({ onPack, onClose }) {
  return html`
    <div class="nudge" role="status">
      <span>${S.kit.nudge}</span>
      <span class="nudge-actions">
        <${Button} variant="primary" onClick=${onPack}>${S.menu.packKit}<//>
        <${Button} variant="quiet" onClick=${onClose}>${S.kit.notNow}<//>
      </span>
    </div>`;
}

export function Help({ onClose }) {
  return html`
    <${Sheet} title=${S.help.title} onClose=${onClose}>
      <div class="help">
        ${S.help.sections.map(([h, t]) => html`<section key=${h}><h3 class="help-head">${h}</h3><p>${t}</p></section>`)}
      </div>
      <div class="sheet-actions"><${Button} variant="secondary" onClick=${onClose}>${S.help.close}<//></div>
    <//>`;
}
