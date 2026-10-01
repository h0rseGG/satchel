import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { useLive } from '../useLive.js';
import { db, deleteFile, setPortrait, updateFile } from '../../db.js';
import { live } from '../../model.js';
import { formatSize } from '../../fileRules.js';
import { href, go } from '../router.js';
import { AddFiles, ThumbGrid, useFileText, useFileUrl } from '../files.js';
import { Confirm, TextField } from '../fields.js';
import { formatShort } from '../format.js';
import { typeLabel } from '../labels.js';

// #/files: every file, newest first. #/files/<id>: the viewer.
export function Files({ parts, pcId, onMessage }) {
  const files = useLive(async () => live(await db.files.toArray()), [], []);
  const openId = parts[1];
  const sorted = [...files].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return html`
    <main class="page">
      <p class="crumb"><a href=${href('/')}>← Dashboard</a></p>
      <div class="page__head">
        <h1 class="page__title">Files</h1>
        <span class="muted">${files.length}</span>
        <${AddFiles} onMessage=${onMessage} />
      </div>
      <p class="muted">Images, .txt and .md files, up to 10 MB each. Images are shrunk to save space.</p>
      ${sorted.length ? html`<${ThumbGrid} files=${sorted} />` : html`<p class="muted">No files yet.</p>`}
      ${openId && html`<${FileViewer} key=${openId} id=${openId} pcId=${pcId} onMessage=${onMessage}
        onClose=${() => history.length > 1 ? history.back() : go('/files')} />`}
    </main>
  `;
}

// One file: view it, rename, attach to something, use as picture, download, delete.
export function FileViewer({ id, pcId, onMessage, onClose }) {
  const file = useLive(() => db.files.get(id), [id], undefined);
  const entities = useLive(async () => live(await db.entities.toArray()), [], []);
  const url = useFileUrl(file && !file.deleted ? id : null);
  const text = useFileText(file?.kind === 'text' && !file.deleted ? id : null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (file === undefined) return null;
  if (!file || file.deleted) {
    return html`<div class="overlay"><div class="dialog" role="dialog" aria-label="File">
      <p>That file was deleted.</p>
      <div class="row dialog__actions"><button type="button" class="btn" onClick=${onClose}>Close</button></div>
    </div></div>`;
  }

  const owner = entities.find((e) => e.id === file.entity_id);
  const options = [...entities].sort((a, b) => (a.id === pcId ? -1 : b.id === pcId ? 1 : a.name.localeCompare(b.name)));
  const isPicture = owner?.portrait_file_id === file.id;
  const run = async (fn, ok) => {
    try { await fn(); if (ok) onMessage({ kind: 'ok', text: ok }); } catch (err) { onMessage({ kind: 'err', text: err.message }); }
  };

  return html`
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}
      onKeyDown=${(e) => e.key === 'Escape' && onClose()}>
      <div class="dialog viewer" role="dialog" aria-modal="true" aria-label=${file.name}>
        <div class="viewer__body">
          ${file.kind === 'image'
            ? (url && html`<img class="viewer__img" src=${url} alt=${file.name} />`)
            : html`<pre class="viewer__text">${text ?? ''}</pre>`}
        </div>
        <div class="viewer__side">
          <p class="muted viewer__meta">${formatSize(file.size ?? 0)}${file.width ? ` · ${file.width}×${file.height}` : ''} · added ${formatShort(file.created_at)}</p>
          <${TextField} id="file-name" label="Name" value=${file.name} onSave=${(v) => updateFile(file.id, { name: v })} />
          <div class="field">
            <label for="file-owner">Attached to</label>
            <select id="file-owner" class="input field__input" value=${file.entity_id ?? ''}
              onChange=${(e) => run(() => updateFile(file.id, { entity_id: e.currentTarget.value || null }))}>
              <option value="">Nothing (Files page only)</option>
              ${options.map((e) => html`<option value=${e.id}>${e.id === pcId ? `${e.name} (my character)` : `${e.name} · ${typeLabel(e)}`}</option>`)}
            </select>
          </div>
          ${owner && html`<p><a href=${href(owner.id === pcId ? '/character' : `/entity/${owner.id}`)}>Open ${owner.name} →</a></p>`}
          <div class="row viewer__actions">
            ${file.kind === 'image' && owner && (isPicture
              ? html`<button type="button" class="btn" onClick=${() => run(() => setPortrait(owner.id, null), 'Picture removed.')}>Stop using as picture</button>`
              : html`<button type="button" class="btn" onClick=${() => run(() => setPortrait(owner.id, file.id), `Now ${owner.name}’s picture.`)}>
                  Use as ${owner.id === pcId ? 'portrait' : 'picture'}</button>`)}
            ${url && html`<a class="btn" href=${url} download=${file.name}>Download</a>`}
            <button type="button" class="btn btn--danger" onClick=${() => setConfirmDelete(true)}>Delete…</button>
            <button type="button" class="btn" onClick=${onClose}>Close</button>
          </div>
        </div>
        ${confirmDelete && html`<${Confirm} title=${`Delete ${file.name}?`} action="Delete" danger
          onCancel=${() => setConfirmDelete(false)}
          onConfirm=${() => { setConfirmDelete(false); run(() => deleteFile(file.id), `Deleted ${file.name}.`).then(onClose); }}>
          <p>It’s removed from this device, and from your other devices when they sync.</p>
        </${Confirm}>`}
      </div>
    </div>
  `;
}
