// htm turns tagged template strings into Preact elements, so we get
// JSX-like components with no compile step:  html`<div class="x">${y}</div>`
import { h } from 'preact';
import htm from 'htm';

export const html = htm.bind(h);
