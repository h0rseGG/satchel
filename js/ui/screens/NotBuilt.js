import { html } from '../html.js';
import { S } from '../strings.js';

export function NotBuilt({ title }) {
  return html`
    <h1 class="page-title">${title}</h1>
    <p class="muted">${S.notBuilt}</p>`;
}
