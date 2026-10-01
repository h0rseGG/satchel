import { html } from '../html.js';
import { S } from '../strings.js';
import { isDndBeyondUrl } from '../../core/model.js';

// "Open in D&D Beyond", in a new tab, shown only for a valid link (SPEC 3.1).
export function DndBeyondButton({ url }) {
  if (!isDndBeyondUrl(url)) return null;
  return html`<a class="btn btn-secondary dndb-btn" href=${url.trim()} target="_blank" rel="noopener noreferrer">${S.character.open}</a>`;
}
