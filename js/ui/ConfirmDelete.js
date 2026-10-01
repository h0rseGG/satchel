import { useEffect, useState } from 'preact/hooks';
import { html } from './html.js';
import { localSummary, packCurrentKit, markBackedUp } from '../db.js';
import { nameKey } from '../model.js';
import { downloadBytes } from './download.js';
import { countsText } from './plural.js';

// Guard for destructive actions (Replace with kit, New character):
// spells out what is lost, makes you type the character's name, and
// downloads a backup kit of it before `onConfirm` runs.
// onDone({ backup }) gets the backup filename for the status message.
export function ConfirmDelete({ title, action, consequence, onConfirm, onCancel, onDone, onError }) {
  const [summary, setSummary] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { localSummary().then(setSummary); }, []);
  if (!summary) return null;

  const matches = Boolean(summary.pcName) && nameKey(typed) === nameKey(summary.pcName);

  async function go() {
    setBusy(true);
    try {
      const { bytes, filename } = await packCurrentKit();
      downloadBytes(bytes, filename);
      await markBackedUp();
      await onConfirm();
      onDone({ backup: filename });
    } catch (err) {
      onError(err);
    }
  }

  return html`
    <div class="overlay">
      <div class="dialog" role="dialog" aria-modal="true" aria-label=${title}>
        <h2 class="dialog__title">${title}</h2>
        <p class="badge badge--err dialog__warn">This deletes <strong>${summary.pcName}</strong> from this device: ${countsText(summary)}.</p>
        <p>${consequence}</p>
        <p>A backup kit of ${summary.pcName} downloads first, so you can unpack it again later.</p>
        <label for="confirm-name">Type <strong>${summary.pcName}</strong> to confirm</label>
        <input id="confirm-name" class="input dialog__input" value=${typed} autocomplete="off"
          onInput=${(e) => setTyped(e.currentTarget.value)} />
        <div class="row dialog__actions">
          <button type="button" class="btn btn--danger" disabled=${!matches || busy} onClick=${go}>${action}</button>
          <button type="button" class="btn" disabled=${busy} onClick=${onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  `;
}
