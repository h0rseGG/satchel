import { useState } from 'preact/hooks';
import { html } from './html.js';
import { deleteNote, editNoteText } from '../db.js';
import { toTypedForEdit } from '../mentions.js';
import { NoteText } from './NoteText.js';
import { Confirm } from './fields.js';
import { formatShort } from './format.js';

// One note out of session: date, mode, text with linked mentions, plus
// Edit and Delete. Editing shows @names in typed form (@Lord_Aldric) and
// links them again on save; the first version is kept (SPEC D13).
// `children`: extra action buttons (e.g. the Inbox's).
export function NoteItem({ note, names, onMessage, children }) {
  const [editing, setEditing] = useState(null); // { text, picked }
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    try {
      await editNoteText(note.id, editing.text, editing.picked);
      setEditing(null);
    } catch (err) {
      onMessage({ kind: 'err', text: err.message });
    }
  }

  return html`
    <li class="inbox__note">
      <div class="inbox__meta muted">
        ${formatShort(note.created_at)} · ${note.mode === 'in' ? 'in session' : 'out of session'}
        ${note.original_text && html` · <span title=${`First written: ${note.original_text}`}>edited</span>`}
      </div>
      ${editing
        ? html`
          <textarea class="input note__edit" aria-label="Edit note" rows="3" value=${editing.text}
            onInput=${(e) => setEditing({ ...editing, text: e.currentTarget.value })}
            onKeyDown=${(e) => {
              if (e.key === 'Escape') setEditing(null);
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
            }}></textarea>
          <p class="muted field__hint">@Name or @Two_Words to mention. Ctrl+Enter saves, Esc cancels.</p>
          <div class="row inbox__actions">
            <button type="button" class="btn btn--primary" onClick=${save}>Save</button>
            <button type="button" class="btn" onClick=${() => setEditing(null)}>Cancel</button>
          </div>`
        : html`
          <p class="inbox__text"><${NoteText} text=${note.text} names=${names} links /></p>
          <div class="row inbox__actions">
            ${children}
            <button type="button" class="btn" onClick=${() => setEditing(toTypedForEdit(note.text, names))}>Edit</button>
            <button type="button" class="btn" onClick=${() => setConfirmDelete(true)}>Delete…</button>
          </div>`}
      ${confirmDelete && html`<${Confirm} title="Delete this note?" action="Delete" danger
        onCancel=${() => setConfirmDelete(false)}
        onConfirm=${async () => { setConfirmDelete(false); await deleteNote(note.id); onMessage({ kind: 'ok', text: 'Note deleted.' }); }}>
        <p>It’s removed here and from your other devices when they sync.</p>
      </${Confirm}>`}
    </li>
  `;
}
