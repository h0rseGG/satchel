import { useRef, useId } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useBlobUrl } from '../useBlobUrl.js';
import { setPortrait, updateEntity } from '../../data/entities.js';
import { toast, reportError } from '../app/toasts.js';

// An entity's picture with Add / Change / Remove. No `accept` filter on the picker:
// Android greys out files it doesn't recognise; the file is checked in code (SPEC 2).
export function Portrait({ entity, size = 120, editable = true }) {
  const url = useBlobUrl(entity.portrait_file_id);
  const input = useRef(null);
  const id = useId();
  const style = `width:${size}px;height:${size}px`;

  const pick = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      await setPortrait(entity.id, file);
      toast(S.portrait.saved, { kind: 'ok', ms: 3000 });
    } catch (err) {
      if (err.reason) toast(S.upload[err.reason] ?? S.errors.unexpected, { kind: 'err' });
      else reportError(err);
    }
  };

  return html`
    <div class="portrait">
      ${url ? html`<img class="portrait-img" src=${url} alt=${S.portrait.alt(entity.name)} style=${style} />`
        : html`<div class="portrait-empty" style=${style} aria-label=${S.portrait.none}><span aria-hidden="true">${entity.name.trim()[0] ?? ''}</span></div>`}
      ${editable && html`
        <div class="portrait-actions">
          <input id=${id} ref=${input} type="file" class="sr-only" onChange=${pick} tabindex="-1" aria-hidden="true" />
          <button type="button" class="btn btn-quiet" onClick=${() => input.current?.click()}>${entity.portrait_file_id ? S.portrait.change : S.portrait.add}</button>
          ${entity.portrait_file_id && html`<button type="button" class="btn btn-quiet" onClick=${() => updateEntity(entity.id, { portrait_file_id: null }).catch(reportError)}>${S.portrait.remove}</button>`}
        </div>`}
    </div>`;
}
