import { useEffect, useRef, useId } from 'preact/hooks';
import { html } from '../html.js';

// A modal sheet: role=dialog with a name, Esc or the backdrop closes, focus moves in
// and goes back where it was afterwards. Used by the confirm sheet, Unpack kit and Help.
export function Sheet({ title, onClose, children, actions }) {
  const id = useId();
  const box = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const first = box.current?.querySelector('input, button:not([disabled]), textarea, select');
    first?.focus();
    return () => before?.focus?.();
  }, []);
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); }
    if (e.key === 'Tab') trapFocus(e, box.current);
  };
  return html`
    <div class="sheet-backdrop" onPointerDown=${(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby=${id} ref=${box} onKeyDown=${onKeyDown}>
        <h2 class="sheet-title" id=${id}>${title}</h2>
        <div class="sheet-body">${children}</div>
        ${actions && html`<div class="sheet-actions">${actions}</div>`}
      </div>
    </div>`;
}

function trapFocus(e, root) {
  const els = [...root.querySelectorAll('input, button:not([disabled]), textarea, select, a[href]')];
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
