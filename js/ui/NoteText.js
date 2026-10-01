import { html } from './html.js';
import { parts } from '../mentions.js';
import { href } from './router.js';

// Render stored note text with mentions shown by the entity's current name.
// names: Map of entity id -> name. Falls back to the label saved in the token
// (e.g. for a deleted entity). With `links`, live mentions link to the
// entity's page (out-of-session screens only; in session, taps stay in the box).
export function NoteText({ text, names, links = false }) {
  return parts(text).map((p, i) => {
    if (p.type === 'text') return p.value;
    const name = names.get(p.id);
    if (links && name) return html`<a class="mention" key=${i} data-id=${p.id} href=${href(`/entity/${p.id}`)}>${name}</a>`;
    return html`<span class="mention" key=${i} data-id=${p.id}>${name ?? p.label}</span>`;
  });
}
