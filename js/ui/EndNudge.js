import { useState } from 'preact/hooks';
import { html } from './html.js';
import { useLive } from './useLive.js';
import { packAndDownload } from './pack.js';
import { syncNow, syncStatus } from '../sync.js';

// Shown when a session ends with unsaved changes (SPEC section 6).
// With sync set up, Sync now is the main action (it also counts as a
// backup); Pack kit is the fallback.
export function EndNudge({ status, onMessage, onClose }) {
  const sync = useLive(syncStatus, [], undefined);
  const [busy, setBusy] = useState(false);
  if (sync === undefined) return null;

  async function doSync() {
    setBusy(true);
    try {
      await syncNow();
      onMessage({ kind: 'ok', text: 'Synced. Tonight’s notes are backed up online.' });
      onClose();
    } catch (err) {
      setBusy(false);
      onMessage({ kind: 'err', text: `Sync failed, nothing lost: ${err.message}. Try Pack kit instead.` });
    }
  }

  return html`
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Session ended">
        <h2 class="dialog__title">Session ended</h2>
        <p>${status.text}. ${sync.configured ? 'Sync now so tonight’s notes are safe online?' : 'Pack your kit now so tonight’s notes are backed up?'}</p>
        <div class="row dialog__actions">
          ${sync.configured && html`
            <button type="button" class="btn btn--primary" disabled=${busy} onClick=${doSync}>${busy ? 'Syncing…' : 'Sync now'}</button>`}
          <button type="button" class=${`btn${sync.configured ? '' : ' btn--primary'}`} disabled=${busy}
            onClick=${() => { onClose(); packAndDownload(onMessage); }}>Pack kit</button>
          <button type="button" class="btn" disabled=${busy} onClick=${onClose}>Not now</button>
        </div>
      </div>
    </div>
  `;
}
