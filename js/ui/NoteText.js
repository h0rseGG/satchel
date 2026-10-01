import { html } from './html.js';
import { parts } from '../mentions.js';

// Render stored note text with mentions shown by the entity's current name.
// names: Map of entity id -> name. Falls back to the label saved in the token.
export function NoteText({ text, names }) {
  return parts(text).map((p, i) =>
    p.type === 'text'
      ? p.value
      : html`<span class="mention" key=${i} data-id=${p.id}>${names.get(p.id) ?? p.label}</span>`,
  );
}
