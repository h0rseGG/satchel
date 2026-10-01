import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from './html.js';
import { startOver } from '../db.js';
import { packAndDownload } from './pack.js';
import { useUnpack } from './useUnpack.js';
import { ConfirmDelete } from './ConfirmDelete.js';
import { SyncSettings } from './SyncSettings.js';
import { useLive } from './useLive.js';
import { syncNow, syncStatus } from '../sync.js';

// Top-bar menu: session toggle, sync, Pack kit (export), Unpack kit (import),
// New character. mode: 'in' | 'out'; onToggleSession switches it.
export function Menu({ onMessage, mode, onToggleSession }) {
  const [open, setOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [settings, setSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const ref = useRef(null);
  const unpack = useUnpack(onMessage);
  const sync = useLive(syncStatus, [], { configured: false, changes: 0, lastSyncedAt: null });

  async function runSync() {
    setOpen(false);
    setSyncing(true);
    onMessage({ kind: 'neutral', text: 'Syncing…' });
    try {
      const { report, uploaded } = await syncNow();
      const got = report ? report.added + report.updated : 0;
      const parts = [];
      if (got) parts.push(`${got} change${got === 1 ? '' : 's'} from the online copy`);
      if (report?.stubsCombined) parts.push(`${report.stubsCombined} duplicate stub${report.stubsCombined === 1 ? '' : 's'} combined`);
      if (uploaded) parts.push(`${uploaded} file${uploaded === 1 ? '' : 's'} uploaded`);
      onMessage({ kind: 'ok', text: parts.length ? `Synced: ${parts.join(', ')}.` : 'Synced: already up to date.' });
    } catch (err) {
      onMessage({ kind: 'err', text: `Sync failed, nothing lost: ${err.message}` });
    }
    setSyncing(false);
  }

  // Close when tapping anywhere else.
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  function pack() {
    setOpen(false);
    packAndDownload(onMessage);
  }

  return html`
    <div class="menu" ref=${ref}>
      <button type="button" class="btn" aria-haspopup="menu" aria-expanded=${open} onClick=${() => setOpen(!open)}>
        Menu
      </button>
      ${open && html`
        <ul class="menu__list" role="menu">
          <li role="none"><button type="button" role="menuitem" class="menu__item"
            onClick=${() => { setOpen(false); onToggleSession(); }}>${mode === 'in' ? 'End session' : 'Start session'}</button></li>
          <li role="separator" class="menu__sep"></li>
          ${sync.configured && html`
            <li role="none"><button type="button" role="menuitem" class="menu__item" disabled=${syncing} onClick=${runSync}>
              Sync now${sync.changes ? ` (${sync.changes} change${sync.changes === 1 ? '' : 's'})` : ''}
            </button></li>`}
          <li role="none"><button type="button" role="menuitem" class="menu__item"
            onClick=${() => { setOpen(false); setSettings(true); }}>${sync.configured ? 'Sync settings…' : 'Set up sync…'}</button></li>
          <li role="separator" class="menu__sep"></li>
          <li role="none"><button type="button" role="menuitem" class="menu__item" onClick=${pack}>Pack kit (download backup)</button></li>
          <li role="none"><button type="button" role="menuitem" class="menu__item"
            onClick=${() => { setOpen(false); unpack.choose(); }}>Unpack kit (merge or replace)</button></li>
          <li role="separator" class="menu__sep"></li>
          <li role="none"><button type="button" role="menuitem" class="menu__item menu__item--danger"
            onClick=${() => { setOpen(false); setConfirmNew(true); }}>New character…</button></li>
        </ul>
      `}
      ${unpack.view}
      ${settings && html`<${SyncSettings} onClose=${() => setSettings(false)} onMessage=${onMessage} />`}
      ${confirmNew && html`<${ConfirmDelete}
        title="New character"
        action="Delete and start fresh"
        consequence="You'll start again from the first screen with a new character."
        onConfirm=${startOver}
        onCancel=${() => setConfirmNew(false)}
        onDone=${() => setConfirmNew(false)}
        onError=${(err) => {
          setConfirmNew(false);
          onMessage({ kind: 'err', text: `Couldn't start fresh, nothing changed: ${err.message}` });
        }}
      />`}
    </div>
  `;
}
