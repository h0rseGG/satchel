import { html } from '../html.js';

// variant: 'primary' (one per area) | 'secondary' | 'quiet' | 'danger'
export function Button({ variant = 'secondary', type = 'button', class: cls = '', children, ...rest }) {
  return html`<button type=${type} class=${`btn btn-${variant} ${cls}`.trim()} ...${rest}>${children}</button>`;
}
