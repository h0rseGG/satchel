import { useState, useEffect } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { useBlobUrl } from '../useBlobUrl.js';
import { href } from '../app/router.js';
import { getFileRecord, getBlob, updateFile, deleteFile } from '../../data/files.js';
import { allEntities, updateEntity } from '../../data/entities.js';
import { allTypes } from '../../data/types.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { Button } from '../components/Button.js';
import { EntityPicker } from '../components/EntityPicker.js';
import { NotBuilt } from './NotBuilt.js';
import { confirmSheet } from '../app/confirm.js';
import { toast, reportError } from '../app/toasts.js';
import { day } from '../format.js';

// One file: view it, rename, caption, attach, use as a picture, download, delete (SPEC 5.2).
export function FileViewer({ id }) {
  const file = useLive(() => getFileRecord(id), [id], undefined);
  const entities = useLive(allEntities, [], []);
  const types = useLive(allTypes, [], []);
  const url = useBlobUrl(file && !file.deleted ? id : null);
  const text = useText(file?.kind === 'text' && !file.deleted ? id : null);
  const [attaching, setAttaching] = useState(false);

  if (file === undefined) return null;
  if (!file || file.deleted) return html`<${NotBuilt} title=${S.files.gone} />`;
  const owner = file.entity_id ? entities.find((e) => e.id === file.entity_id && !e.deleted) : null;
  const typeLabel = (tid) => types.find((t) => t.id === tid)?.label ?? '';
  const save = (patch) => updateFile(id, patch).catch(reportError);

  const usePicture = () => updateEntity(owner.id, { portrait_file_id: id }).then(() => toast(S.files.pictureSet(owner.name), { kind: 'ok' }), reportError);
  const download = async () => {
    const blob = await getBlob(id);
    const u = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: u, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10_000);
  };
  const del = async () => {
    if (!(await confirmSheet({ title: S.files.confirmDelete(file.name), body: S.files.confirmDeleteBody, confirmLabel: S.common.delete }))) return;
    try {
      await deleteFile(id);
      toast(S.files.deleted(file.name), { kind: 'ok' });
      location.hash = owner ? href('entity', { id: owner.id }) : href('files');
    } catch (err) {
      reportError(err);
    }
  };

  return html`
    <h1 class="page-title">${file.name}</h1>
    <p class="muted file-meta">${day(file.created_at)} · ${S.files.size(file.size)}${file.width ? ` · ${S.files.dims(file.width, file.height)}` : ''}</p>
    <figure class="file-view">
      ${file.kind === 'image' ? url && html`<img class="file-view-img" src=${url} alt=${file.caption || file.name} />`
        : html`<pre class="file-view-text">${text ?? ''}</pre>`}
      ${file.caption && html`<figcaption>${file.caption}</figcaption>`}
    </figure>
    <div class="row-wrap file-actions">
      <${Button} variant="primary" onClick=${download}>${S.files.download}<//>
      ${owner && file.kind === 'image' && (owner.portrait_file_id === id ? html`<span class="muted">${S.files.isPicture(owner.name)}</span>` : html`<${Button} variant="secondary" onClick=${usePicture}>${S.files.usePicture(owner.name)}<//>`)}
    </div>
    <${Panel}>
      <${Field} label=${S.files.name} value=${file.name} onSave=${(v) => v.trim() && save({ name: v.trim() })} />
      <${Field} label=${S.files.caption} value=${file.caption} onSave=${(v) => save({ caption: v.trim() })} />
      <div class="field">
        <span class="field-label">${S.files.attachedTo}</span>
        ${attaching ? html`<${EntityPicker} label=${S.files.attachLabel} entities=${entities.filter((e) => !e.deleted)} typeLabel=${typeLabel} onPick=${(e) => { setAttaching(false); save({ entity_id: e.id }); }} autofocus limit=${6} />`
          : html`<div class="row-wrap">
              ${owner ? html`<a class="mention" href=${href('entity', { id: owner.id })}>${owner.name}</a>` : html`<span class="muted">${S.files.nobody}</span>`}
              <${Button} variant="quiet" onClick=${() => setAttaching(true)}>${S.files.attach}<//>
              ${owner && html`<${Button} variant="quiet" onClick=${() => save({ entity_id: null })}>${S.files.detach}<//>`}
            </div>`}
      </div>
    <//>
    <div class="entity-actions"><${Button} variant="danger" onClick=${del}>${S.files.delete}<//></div>`;
}

// A text file's contents, decoded as UTF-8 and shown as text (never as HTML).
function useText(id) {
  const [text, setText] = useState(null);
  useEffect(() => {
    let live = true;
    setText(null);
    if (id) getBlob(id).then((b) => b?.text()).then((t) => { if (live) setText(t ?? ''); });
    return () => { live = false; };
  }, [id]);
  return text;
}
