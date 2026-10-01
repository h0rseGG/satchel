import { useEffect, useState } from 'preact/hooks';
import { html } from './html.js';
import { replaceWithKit } from '../db.js';
import { fetchOnlineCopy, forgetSyncSettings, replaceOnlineCopy, saveSyncSettings, syncSettings } from '../sync.js';
import { ConfirmDelete } from './ConfirmDelete.js';

// Sync settings: repo, token, device name; plus the emergency overwrites.
export function SyncSettings({ onClose, onMessage }) {
  const [form, setForm] = useState(null);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'online' | { data, after }

  useEffect(() => {
    syncSettings().then((s) => {
      setForm({ repo: s.repo, token: s.token, device: s.device });
      setConfigured(Boolean(s.repo && s.token && s.device));
    });
  }, []);
  if (!form) return null;

  const field = (key) => (e) => setForm({ ...form, [key]: e.currentTarget.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveSyncSettings(form);
      onMessage({ kind: 'ok', text: `Sync set up: ${form.repo} as “${form.device.trim()}”. Use Menu → Sync now.` });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function forget() {
    await forgetSyncSettings();
    onMessage({ kind: 'ok', text: 'Sync settings removed from this device (the online copy is untouched).' });
    onClose();
  }

  async function startReplaceDevice() {
    setBusy(true);
    setError('');
    try {
      setConfirm(await fetchOnlineCopy());
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  if (confirm === 'online') {
    return html`
      <div class="overlay">
        <div class="dialog" role="dialog" aria-modal="true" aria-label="Replace online copy">
          <h2 class="dialog__title">Replace online copy</h2>
          <p class="badge badge--err dialog__warn">The online copy of this character is overwritten with this device, without merging. Changes only the other device has synced are lost.</p>
          <p class="muted">GitHub keeps the old version in the repo’s history.</p>
          <div class="row dialog__actions">
            <button type="button" class="btn btn--danger" disabled=${busy} onClick=${async () => {
              setBusy(true);
              try {
                await replaceOnlineCopy();
                onMessage({ kind: 'ok', text: 'Online copy replaced with this device.' });
                onClose();
              } catch (err) {
                setError(err.message);
                setConfirm(null);
                setBusy(false);
              }
            }}>Replace online copy</button>
            <button type="button" class="btn" onClick=${() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      </div>`;
  }

  if (confirm) {
    return html`<${ConfirmDelete}
      title="Replace this device"
      action="Replace with online copy"
      consequence="It is replaced by the online copy, without merging."
      onConfirm=${async () => { await replaceWithKit(confirm.data); await confirm.after(); }}
      onCancel=${() => setConfirm(null)}
      onDone=${({ backup }) => {
        onMessage({ kind: 'ok', text: `This device now matches the online copy. Backup of what was here: ${backup}.` });
        onClose();
      }}
      onError=${(err) => { setError(`Replace failed, nothing changed: ${err.message}`); setConfirm(null); }}
    />`;
  }

  return html`
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <form class="dialog" role="dialog" aria-modal="true" aria-label="Sync settings" onSubmit=${save}>
        <h2 class="dialog__title">Sync settings</h2>
        <p class="muted">Syncs this character with a private GitHub repo. Each device needs its own settings.</p>
        <label for="sync-repo">Private repo (owner/name)</label>
        <input id="sync-repo" class="input dialog__input" value=${form.repo} placeholder="h0rseGG/satchel-data"
          autocomplete="off" autocapitalize="off" spellcheck="false" onInput=${field('repo')} />
        <label for="sync-token">GitHub token</label>
        <input id="sync-token" class="input dialog__input" type="password" value=${form.token}
          autocomplete="off" spellcheck="false" onInput=${field('token')} />
        <p class="muted dialog__hint">Fine-grained token, only this repo, Contents: Read and write. Stored on this device only, never in kits.</p>
        <label for="sync-device">This device’s name</label>
        <input id="sync-device" class="input dialog__input" value=${form.device} placeholder="Pixel" onInput=${field('device')} />
        ${error && html`<p class="badge badge--err dialog__warn" role="alert">${error}</p>`}
        <div class="row dialog__actions">
          <button type="submit" class="btn btn--primary" disabled=${busy}>${busy ? 'Checking…' : 'Save and test'}</button>
          <button type="button" class="btn" onClick=${onClose}>Cancel</button>
        </div>
        ${configured && html`
          <details class="dialog__more">
            <summary>Emergency and removal</summary>
            <p class="muted">Use only if a merge went wrong. Normal use is Sync now.</p>
            <div class="row dialog__actions">
              <button type="button" class="btn btn--danger" disabled=${busy} onClick=${() => setConfirm('online')}>Replace online copy…</button>
              <button type="button" class="btn btn--danger" disabled=${busy} onClick=${startReplaceDevice}>Replace this device…</button>
              <button type="button" class="btn" disabled=${busy} onClick=${forget}>Remove sync settings</button>
            </div>
          </details>
        `}
      </form>
    </div>
  `;
}
