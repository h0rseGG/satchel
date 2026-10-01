import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from './html.js';
import { startOver } from '../db.js';
import { packAndDownload } from './pack.js';
import { useUnpack } from './useUnpack.js';
import { ConfirmDelete } from './ConfirmDelete.js';

// Top-bar menu: Pack kit (export), Unpack kit (import), New character.
export function Menu({ onMessage }) {
  const [open, setOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const ref = useRef(null);
  const unpack = useUnpack(onMessage);

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
          <li role="none"><button type="button" role="menuitem" class="menu__item" onClick=${pack}>Pack kit (download backup)</button></li>
          <li role="none"><button type="button" role="menuitem" class="menu__item"
            onClick=${() => { setOpen(false); unpack.choose(); }}>Unpack kit (merge or replace)</button></li>
          <li role="separator" class="menu__sep"></li>
          <li role="none"><button type="button" role="menuitem" class="menu__item menu__item--danger"
            onClick=${() => { setOpen(false); setConfirmNew(true); }}>New character…</button></li>
        </ul>
      `}
      ${unpack.view}
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
