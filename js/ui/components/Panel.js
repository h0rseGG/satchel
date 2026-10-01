import { html } from '../html.js';

export function Panel({ title, action, children, class: cls = '', titleId }) {
  return html`
    <section class=${`panel ${cls}`.trim()} aria-labelledby=${titleId}>
      ${(title || action) && html`<header class="panel-head">${title && html`<h2 class="panel-title" id=${titleId}>${title}</h2>`}${action}</header>`}
      ${children}
    </section>`;
}
