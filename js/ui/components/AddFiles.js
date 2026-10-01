import { useRef } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { addFile } from '../../data/files.js';
import { toast, reportError } from '../app/toasts.js';

// "Add files": no `accept` filter (Android greys out what it doesn't recognise);
// every file is checked in code and refused files get their own message.
export function AddFiles({ entityId = null, label = S.files.add, variant = 'secondary', onAdded }) {
  const input = useRef(null);
  const pick = async (e) => {
    const files = [...(e.currentTarget.files || [])];
    e.currentTarget.value = '';
    let added = 0;
    let last = null;
    for (const f of files) {
      try {
        last = await addFile(f, { entityId });
        added++;
      } catch (err) {
        if (err.reason) toast(S.files.refused(f.name, S.upload[err.reason] ?? S.errors.unexpected), { kind: 'err' });
        else reportError(err);
      }
    }
    if (added) {
      toast(S.files.added(added), { kind: 'ok', ms: 3000 });
      onAdded?.(last, added);
    }
  };
  return html`
    <span class="add-files">
      <input ref=${input} type="file" multiple class="sr-only" tabindex="-1" aria-hidden="true" onChange=${pick} />
      <button type="button" class=${`btn btn-${variant}`} onClick=${() => input.current?.click()}>${label}</button>
    </span>`;
}
