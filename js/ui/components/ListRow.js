import { html } from '../html.js';

// A ruled row: title (link or text), quiet meta on the right, optional detail and actions.
export function ListRow({ title, href, meta, detail, actions, children }) {
  return html`
    <li class="list-row">
      <div class="list-row-main">
        ${href ? html`<a class="list-row-title" href=${href}>${title}</a>` : html`<span class="list-row-title">${title}</span>`}
        ${meta != null && html`<span class="list-row-meta">${meta}</span>`}
      </div>
      ${detail && html`<div class="list-row-detail">${detail}</div>`}
      ${children}
      ${actions && html`<div class="list-row-actions">${actions}</div>`}
    </li>`;
}

export function RuledList({ children, label }) {
  return html`<ul class="ruled-list" aria-label=${label}>${children}</ul>`;
}
