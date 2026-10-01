import { h } from 'preact';
import htm from 'htm';

// htm drops whitespace that contains a newline: keep text with ${} on one line.
export const html = htm.bind(h);
