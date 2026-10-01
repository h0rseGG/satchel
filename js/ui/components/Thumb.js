import { html } from '../html.js';
import { useBlobUrl } from '../useBlobUrl.js';

// A file thumbnail: the image itself, or a plain label for text files.
export function Thumb({ file, size = 96 }) {
  const url = useBlobUrl(file?.kind === 'image' ? file.id : null);
  const style = `width:${size}px;height:${size}px`;
  if (file?.kind === 'image' && url) return html`<img class="thumb" src=${url} alt=${file.caption || file.name} style=${style} />`;
  const ext = (file?.name?.match(/\.([^.]+)$/)?.[1] ?? 'txt').toUpperCase();
  return html`<span class="thumb thumb-text" style=${style} aria-label=${file?.name}>${ext}</span>`;
}
