import { html } from '../html.js';
import { segments } from '../../core/mentions.js';
import { href } from '../app/router.js';

// A note's text with mentions as chips (current names) and tags as quiet links.
// Text is rendered as text nodes only: never innerHTML with user data (SPEC 10).
// plain: no links (in session, where a tap must not pull focus from the box).
export function NoteText({ text, byId, plain = false }) {
  return html`<span class="note-text">${segments(text, byId).map((s) => {
    if (s.type === 'mention') return plain || s.missing ? html`<span class=${`mention${s.missing ? ' is-missing' : ''}`}>${s.label}</span>` : html`<a class="mention" href=${href('entity', { id: s.id })}>${s.label}</a>`;
    if (s.type === 'tag') return plain ? html`<span class="tag">${s.text}</span>` : html`<a class="tag" href=${href('notes', {}, { tag: s.key })}>${s.text}</a>`;
    return s.text;
  })}</span>`;
}
