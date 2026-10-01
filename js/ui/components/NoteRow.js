import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { editForm, editNote, deleteNote } from '../../data/notes.js';
import { NoteText } from './NoteText.js';
import { CaptureBox } from './CaptureBox.js';
import { Button } from './Button.js';
import { confirmSheet } from '../app/confirm.js';
import { toast, reportError } from '../app/toasts.js';
import { when } from '../format.js';

// A note in a list, editable in place (same box and autocomplete as capture).
// actions: extra buttons (Inbox), shown before Edit and Delete.
export function NoteRow({ note, cap, pcId, actions, children }) {
  const [form, setForm] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const startEdit = () => editForm(note.id).then(setForm, reportError);
  const submit = async (typed, picks) => {
    const saved = await editNote(note.id, typed, { picks });
    setForm(null);
    return saved;
  };
  const del = async () => {
    if (!(await confirmSheet({ title: S.note.confirmDelete, body: S.note.confirmDeleteBody, confirmLabel: S.common.delete }))) return;
    deleteNote(note.id).then(() => toast(S.note.deleted, { kind: 'ok' }), reportError);
  };

  return html`
    <li class="list-row note-row" data-note=${note.id}>
      <div class="note-row-meta">
        <span>${when(note.created_at)}</span>
        <span class="note-mode">${note.mode === 'in' ? S.note.modeIn : S.note.modeOut}</span>
        ${note.original_text && html`<button type="button" class="note-edited" aria-expanded=${showOriginal ? 'true' : 'false'} onClick=${() => setShowOriginal(!showOriginal)}>${S.note.edited}</button>`}
        ${!form && html`
          <span class="note-row-manage">
            <button type="button" class="note-link" onClick=${startEdit}>${S.note.edit}</button>
            <button type="button" class="note-link note-link-danger" onClick=${del}>${S.note.delete}</button>
          </span>`}
      </div>
      ${form ? html`
        <div class="note-edit">
          <${CaptureBox} cap=${cap} pcId=${pcId} label=${S.note.editLabel} initial=${form.text} initialPicks=${form.picks} onSubmit=${submit} onCancel=${() => setForm(null)} autoFocus />
          <div class="inline-form-actions"><${Button} variant="quiet" onClick=${() => setForm(null)}>${S.common.cancel}<//></div>
        </div>` : html`<div class="note-row-text">${cap && html`<${NoteText} text=${note.text} byId=${cap.byId} />`}</div>`}
      ${showOriginal && note.original_text && cap && html`<p class="note-original"><span class="muted">${S.note.original}</span> <${NoteText} text=${note.original_text} byId=${cap.byId} /></p>`}
      ${children}
      ${!form && actions && html`<div class="list-row-actions">${actions}</div>`}
    </li>`;
}
