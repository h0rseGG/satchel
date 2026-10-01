import { useRef, useState } from 'preact/hooks';
import { html } from './html.js';
import { unpackKit } from '../kit.js';
import { planUnpack, unpackMerge, unpackNew } from '../db.js';
import { formatShort } from './format.js';

// Unpack kit: pick a file, show what will happen, apply on confirm.
// Returns { choose, view }: call choose() to open the file picker, render view.
export function useUnpack(onMessage) {
  const input = useRef(null);
  const [plan, setPlan] = useState(null);

  function choose() {
    input.current.value = '';
    input.current.click();
  }

  async function onFile(e) {
    const file = e.currentTarget.files[0];
    if (!file) return;
    try {
      const { data, report } = unpackKit(new Uint8Array(await file.arrayBuffer()));
      const p = await planUnpack(data);
      setPlan({ ...p, data, kitReport: report, fileName: file.name });
    } catch (err) {
      onMessage({ kind: 'err', text: `Couldn't unpack ${file.name}: ${err.message}` });
    }
  }

  async function confirm() {
    const { mode, data, kitReport } = plan;
    setPlan(null);
    try {
      const skipped = kitReport.skipped.length ? ` ${kitReport.skipped.length} damaged item(s) skipped.` : '';
      if (mode === 'new') {
        await unpackNew(data);
        onMessage({ kind: 'ok', text: `Kit unpacked: ${data.notes.length} notes, ${data.entities.length} entities.${skipped}` });
      } else {
        const r = await unpackMerge(data);
        onMessage({ kind: 'ok', text: `Kit merged: ${summary(r)}.${skipped}` });
      }
    } catch (err) {
      onMessage({ kind: 'err', text: `Unpack failed, nothing changed: ${err.message}` });
    }
  }

  const view = html`
    <input ref=${input} type="file" class="visually-hidden" aria-label="Kit file" tabindex="-1" onChange=${onFile} />
    ${plan && html`<${Dialog} plan=${plan} onConfirm=${confirm} onCancel=${() => setPlan(null)} />`}
  `;
  return { choose, view };
}

function summary(r) {
  const parts = [`${r.added} added`, `${r.updated} updated`];
  if (r.keptLocal) parts.push(`${r.keptLocal} kept from this device (newer here)`);
  if (r.stubsCombined) parts.push(`${r.stubsCombined} duplicate stub${r.stubsCombined === 1 ? '' : 's'} combined`);
  return parts.join(', ');
}

function Dialog({ plan, onConfirm, onCancel }) {
  const { mode, data, kitReport, fileName } = plan;
  const pcName = data.entities.find((e) => e.id === data.pc_entity_id)?.name ?? 'Unknown character';
  const packed = data.exported_at ? `packed ${formatShort(data.exported_at)}` : 'pack date unknown';

  let body;
  let action = null;
  if (mode === 'new') {
    body = html`<p>Unpack <strong>${pcName}</strong> (${packed}) onto this device?</p>
      <p>${data.notes.length} notes, ${data.entities.length} entities.</p>`;
    action = 'Unpack';
  } else if (mode === 'merge') {
    const r = plan.report;
    body = html`<p>Merge <strong>${pcName}</strong> (${packed}) into this device?</p>
      <p>${summary(r)}. Nothing on this device is deleted unless the kit has a newer deletion.</p>`;
    action = 'Merge';
  } else {
    body = html`<p>This kit is a different character: <strong>${pcName}</strong>.</p>
      <p class="muted">Replacing the character on this device comes in a later build.</p>`;
  }

  return html`
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && onCancel()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Unpack kit">
        <h2 class="dialog__title">Unpack kit</h2>
        <p class="muted dialog__file">${fileName}</p>
        ${body}
        ${kitReport.skipped.length > 0 && html`
          <p class="badge badge--warn">${kitReport.skipped.length} damaged item(s) in the kit will be skipped.</p>
        `}
        <div class="row dialog__actions">
          ${action && html`<button type="button" class="btn btn--primary" onClick=${onConfirm}>${action}</button>`}
          <button type="button" class="btn" onClick=${onCancel}>${action ? 'Cancel' : 'OK'}</button>
        </div>
      </div>
    </div>
  `;
}
