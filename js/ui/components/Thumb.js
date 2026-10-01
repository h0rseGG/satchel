import { html } from '../html.js';
import { useBlobUrl } from '../useBlobUrl.js';

// A file thumbnail: the image itself, or a plain label for text files.
// fluid: fill the parent (grid tiles size themselves in CSS).
export function Thumb({ file, size = 96, fluid = false }) {
  const url = useBlobUrl(file?.kind === 'image' ? file.id : null);
  const style = fluid ? undefined : `width:${size}px;height:${size}px`;
  if (file?.kind === 'image' && url) return html`<img class=${fluid ? 'thumb thumb-fluid' : 'thumb'} src=${url} alt=${file.caption || file.name} style=${style} />`;
  const ext = (file?.name?.match(/\.([^.]+)$/)?.[1] ?? 'txt').toUpperCase();
  return html`<span class=${fluid ? 'thumb thumb-text thumb-fluid' : 'thumb thumb-text'} style=${style} aria-label=${file?.name}>${ext}</span>`;
}
