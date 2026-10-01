import { html } from '../html.js';
import { segments } from '../../core/mentions.js';
import { href } from '../app/router.js';

// A note's text with mentions as chips (current names) and tags as quiet links.
// Text is rendered as text nodes only: never innerHTML with user data (SPEC 10).
export function NoteText({ text, byId, linkTags = true }) {
  return html`<span class="note-text">${segments(text, byId).map((s) => {
    if (s.type === 'mention') return s.missing ? html`<span class="mention is-missing">${s.label}</span>` : html`<a class="mention" href=${href('entity', { id: s.id })}>${s.label}</a>`;
    if (s.type === 'tag') return linkTags ? html`<a class="tag" href=${href('notes', {}, { tag: s.key })}>${s.text}</a>` : html`<span class="tag">${s.text}</span>`;
    return s.text;
  })}</span>`;
}
