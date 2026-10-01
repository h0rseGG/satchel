import { useEffect, useRef } from 'preact/hooks';
import { html } from './html.js';
import { dayKey, formatDay, formatTime } from './format.js';

// Recent notes, oldest at top, newest just above the box (chat-style, D11).
export function Feed({ notes }) {
  const ref = useRef(null);

  // Keep the newest note in view when one is added.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [notes.length]);

  if (!notes.length) {
    return html`<main class="results" ref=${ref}>
      <p class="muted">No notes yet. Type below and press Enter.</p>
    </main>`;
  }

  const rows = [];
  let lastDay = null;
  for (const n of notes) {
    const day = dayKey(n.created_at);
    if (day !== lastDay) {
      rows.push(html`<h2 class="feed__day" key=${`d-${day}`}>${formatDay(n.created_at)}</h2>`);
      lastDay = day;
    }
    rows.push(html`
      <article class="note" key=${n.id}>
        <time class="note__time muted" datetime=${n.created_at}>${formatTime(n.created_at)}</time>
        <p class="note__text">${n.text}</p>
      </article>
    `);
  }

  return html`<main class="results" ref=${ref} aria-live="polite">${rows}</main>`;
}
