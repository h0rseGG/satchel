import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from './html.js';
import { useLive } from './useLive.js';
import { db, addFile } from '../db.js';
import { prepareUpload } from '../upload.js';
import { href } from './router.js';

// An object URL for a stored file's bytes; revoked when no longer shown.
export function useFileUrl(fileId) {
  const row = useLive(() => (fileId ? db.blobs.get(fileId) : null), [fileId], null);
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!row?.data) { setUrl(null); return undefined; }
    const u = URL.createObjectURL(row.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [row]);
  return url;
}

// A stored text file's contents.
export function useFileText(fileId) {
  const row = useLive(() => (fileId ? db.blobs.get(fileId) : null), [fileId], null);
  const [text, setText] = useState(null);
  useEffect(() => {
    let live = true;
    if (row?.data) row.data.text().then((t) => live && setText(t));
    return () => { live = false; };
  }, [row]);
  return text;
}

// A small square preview: the image, or the file name for text files.
// Links to the viewer (#/files/<id>).
export function FileThumb({ file }) {
  const url = useFileUrl(file.kind === 'image' ? file.id : null);
  return html`
    <a class="thumb" href=${href(`/files/${file.id}`)} title=${file.name}>
      ${file.kind === 'image'
        ? (url ? html`<img src=${url} alt=${file.name} loading="lazy" />` : html`<span class="thumb__ph"></span>`)
        : html`<span class="thumb__text"><span class="thumb__ext">${/\.md$/i.test(file.name) ? 'MD' : 'TXT'}</span>${file.name}</span>`}
    </a>
  `;
}

// An entity's picture (the character's portrait), if it has one.
export function Portrait({ entity, className = 'portrait' }) {
  const url = useFileUrl(entity?.portrait_file_id ?? null);
  if (!url) return null;
  return html`<img class=${className} src=${url} alt=${`${entity.name}`} />`;
}

export function ThumbGrid({ files }) {
  return html`<div class="thumbs">${files.map((f) => html`<${FileThumb} key=${f.id} file=${f} />`)}</div>`;
}

// "Add files" button: picks files, prepares and stores them, reports results.
// No `accept` filter (Android pickers can grey out valid files); every file
// is checked in prepareUpload instead. onAdded(files) after success.
export function AddFiles({ entityId = null, label = 'Add files…', imagesOnly = false, onMessage, onAdded = () => {} }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  async function onChange(e) {
    const picked = [...e.currentTarget.files];
    e.currentTarget.value = '';
    if (!picked.length) return;
    setBusy(true);
    const added = [];
    const problems = [];
    for (const f of picked) {
      try {
        const prepared = await prepareUpload(f);
        if (imagesOnly && prepared.kind !== 'image') throw new Error(`${f.name} isn’t an image.`);
        added.push(await addFile(prepared, entityId));
      } catch (err) {
        problems.push(err.message);
      }
    }
    setBusy(false);
    if (problems.length) onMessage({ kind: 'err', text: problems.join(' ') });
    else onMessage({ kind: 'ok', text: added.length === 1 ? `Added ${added[0].name}.` : `Added ${added.length} files.` });
    if (added.length) onAdded(added);
  }

  return html`
    <span class="addfiles">
      <input ref=${input} type="file" multiple=${!imagesOnly} class="visually-hidden" tabindex="-1"
        aria-hidden="true" data-picker=${label} onChange=${onChange} />
      <button type="button" class="btn" disabled=${busy} onClick=${() => input.current.click()}>
        ${busy ? 'Adding…' : label}
      </button>
    </span>
  `;
}
