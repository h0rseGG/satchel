import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from './html.js';
import { packCurrentKit, markBackedUp } from '../db.js';
import { downloadBytes } from './download.js';

// Top-bar menu: Pack kit (export) now; Unpack kit (import) in build step 8.
export function Menu({ onMessage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close when tapping anywhere else.
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  async function pack() {
    setOpen(false);
    try {
      const { bytes, filename } = await packCurrentKit();
      downloadBytes(bytes, filename);
      await markBackedUp();
      onMessage({ kind: 'ok', text: `Kit packed: ${filename}` });
    } catch (err) {
      onMessage({ kind: 'err', text: `Couldn't pack kit: ${err.message}` });
    }
  }

  return html`
    <div class="menu" ref=${ref}>
      <button type="button" class="btn" aria-haspopup="menu" aria-expanded=${open} onClick=${() => setOpen(!open)}>
        Menu
      </button>
      ${open && html`
        <ul class="menu__list" role="menu">
          <li role="none"><button type="button" role="menuitem" class="menu__item" onClick=${pack}>Pack kit (download backup)</button></li>
          <li role="none"><button type="button" role="menuitem" class="menu__item" disabled>Unpack kit (next build)</button></li>
        </ul>
      `}
    </div>
  `;
}
