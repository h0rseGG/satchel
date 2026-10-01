import { useState, useEffect } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { subscribeToasts, dismissToast } from './toasts.js';

// Fixed under the top bar, over the page, so nothing shifts under a finger. Tap to dismiss.
export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => subscribeToasts(setItems), []);
  return html`
    <div class="toasts" role="status" aria-live="polite">
      ${items.map((t) => html`
        <button type="button" key=${t.id} class=${`toast toast-${t.kind}`} aria-label=${`${t.text}. ${S.common.dismiss}`} onClick=${() => dismissToast(t.id)}>${t.text}</button>`)}
    </div>`;
}
