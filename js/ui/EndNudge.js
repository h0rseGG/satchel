import { html } from './html.js';
import { packAndDownload } from './pack.js';

// Shown when a session ends with unsaved changes (SPEC section 6).
export function EndNudge({ status, onMessage, onClose }) {
  return html`
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Session ended">
        <h2 class="dialog__title">Session ended</h2>
        <p>${status.text}. Pack your kit now so tonight's notes are backed up?</p>
        <div class="row dialog__actions">
          <button type="button" class="btn btn--primary" onClick=${() => { onClose(); packAndDownload(onMessage); }}>Pack kit</button>
          <button type="button" class="btn" onClick=${onClose}>Not now</button>
        </div>
      </div>
    </div>
  `;
}
