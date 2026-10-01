import { html } from '../html.js';
import { href } from '../app/router.js';
import { Thumb } from './Thumb.js';

// Files as tiles: thumbnail and name, each opening the viewer.
export function FileGrid({ files, size = 120, label }) {
  return html`
    <ul class="file-grid" aria-label=${label} style=${`--tile:${size}px`}>
      ${files.map((f) => html`
        <li key=${f.id} class="file-tile">
          <a href=${href('file', { id: f.id })} class="file-tile-link">
            <${Thumb} file=${f} fluid />
            <span class="file-tile-name">${f.name}</span>
          </a>
        </li>`)}
    </ul>`;
}
