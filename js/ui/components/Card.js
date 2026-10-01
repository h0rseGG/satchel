import { html } from '../html.js';

// Recall-card style: ink border on panel paper. head: name, type, tags; then content.
export function Card({ title, sub, tags = [], aside, children, class: cls = '' }) {
  return html`
    <div class=${`card ${cls}`.trim()}>
      <div class="card-head">
        <strong class="card-title">${title}</strong>
        ${sub && html`<span class="card-sub">${sub}</span>`}
        ${tags.length > 0 && html`<span class="card-tags">${tags.join(', ')}</span>`}
        ${aside && html`<span class="card-aside">${aside}</span>`}
      </div>
      ${children}
    </div>`;
}
