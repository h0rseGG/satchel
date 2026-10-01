import { useRef, useState } from 'preact/hooks';
import { html } from './html.js';
import { unpackKit } from '../kit.js';
import { planUnpack, replaceWithKit, unpackMerge, unpackNew } from '../db.js';
import { formatShort } from './format.js';
import { ConfirmDelete } from './ConfirmDelete.js';
import { countsText } from './plural.js';

// Unpack kit: pick a file, show what will happen, apply on confirm.
// Returns { choose, view }: call choose() to open the file picker, render view.
export function useUnpack(onMessage) {
  const input = useRef(null);
  const [plan, setPlan] = useState(null);
  const [replacing, setReplacing] = useState(false);

  function choose() {
    input.current.value = '';
    input.current.click();
  }

  function close() {
    setPlan(null);
    setReplacing(false);
  }

  async function planFrom(bytes, fileName) {
    try {
      const { data, report } = unpackKit(bytes);
      const p = await planUnpack(data);
      setPlan({ ...p, data, kitReport: report, fileName });
    } catch (err) {
      onMessage({ kind: 'err', text: `Couldn't unpack ${fileName}: ${err.message}` });
    }
  }

  async function onFile(e) {
    const file = e.currentTarget.files[0];
    if (file) await planFrom(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  // A kit shipped with the app (the demo character). Same confirm screen.
  async function chooseUrl(url, fileName) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      await planFrom(new Uint8Array(await res.arrayBuffer()), fileName);
    } catch (err) {
      onMessage({ kind: 'err', text: `Couldn't get ${fileName}: ${err.message}` });
    }
  }

  const skippedNote = (p) => (p.kitReport.skipped.length ? ` ${p.kitReport.skipped.length} damaged item(s) skipped.` : '');

  async function confirm() {
    const p = plan;
    close();
    try {
      if (p.mode === 'new') {
        await unpackNew(p.data);
        onMessage({ kind: 'ok', text: `Kit unpacked: ${countsText({ notes: p.data.notes.length, entities: p.data.entities.length })}.${skippedNote(p)}` });
      } else {
        const r = await unpackMerge(p.data);
        onMessage({ kind: 'ok', text: `Kit merged: ${summary(r)}.${skippedNote(p)}` });
      }
    } catch (err) {
      onMessage({ kind: 'err', text: `Unpack failed, nothing changed: ${err.message}` });
    }
  }

  let dialog = null;
  if (plan && replacing) {
    const kitName = pcNameOf(plan.data);
    dialog = html`<${ConfirmDelete}
      title="Replace with kit"
      action=${`Replace with ${kitName}`}
      consequence=${`It is replaced by ${kitName} from ${plan.fileName}.`}
      onConfirm=${() => replaceWithKit(plan.data)}
      onCancel=${close}
      onDone=${({ backup }) => {
        close();
        onMessage({ kind: 'ok', text: `Replaced with ${kitName}. Backup of the old character: ${backup}.${skippedNote(plan)}` });
      }}
      onError=${(err) => {
        close();
        onMessage({ kind: 'err', text: `Replace failed, nothing changed: ${err.message}` });
      }}
    />`;
  } else if (plan) {
    dialog = html`<${Dialog} plan=${plan} onConfirm=${confirm} onReplace=${() => setReplacing(true)} onCancel=${close} />`;
  }

  const view = html`
    <input ref=${input} type="file" class="visually-hidden" aria-label="Kit file" tabindex="-1" onChange=${onFile} />
    ${dialog}
  `;
  return { choose, chooseUrl, view };
}

function pcNameOf(data) {
  return data.entities.find((e) => e.id === data.pc_entity_id)?.name ?? 'Unknown character';
}

function summary(r) {
  const parts = [`${r.added} added`, `${r.updated} updated`];
  if (r.keptLocal) parts.push(`${r.keptLocal} kept from this device (newer here)`);
  if (r.stubsCombined) parts.push(`${r.stubsCombined} duplicate stub${r.stubsCombined === 1 ? '' : 's'} combined`);
  return parts.join(', ');
}

function Dialog({ plan, onConfirm, onReplace, onCancel }) {
  const { mode, data, kitReport, fileName } = plan;
  const pcName = pcNameOf(data);
  const packed = data.exported_at ? `packed ${formatShort(data.exported_at)}` : 'pack date unknown';

  let body;
  let action = null;
  if (mode === 'new') {
    body = html`<p>Unpack <strong>${pcName}</strong> (${packed}) onto this device?</p>
      <p>${countsText({ notes: data.notes.length, entities: data.entities.length })}.</p>`;
    action = 'Unpack';
  } else if (mode === 'merge') {
    const r = plan.report;
    body = html`<p>Merge <strong>${pcName}</strong> (${packed}) into this device?</p>
      <p>${summary(r)}. Nothing on this device is deleted unless the kit has a newer deletion.</p>`;
    action = 'Merge';
  } else {
    body = html`<p>This kit is a different character: <strong>${pcName}</strong> (${packed}).</p>
      <p>Characters can't be merged. You can replace the character on this device with this kit.</p>`;
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
          ${mode !== 'new' && html`
            <button type="button" class=${`btn${mode === 'different' ? ' btn--danger' : ''} dialog__replace`} onClick=${onReplace}>
              ${mode === 'merge' ? 'Replace instead…' : 'Replace…'}
            </button>
          `}
          ${action && html`<button type="button" class="btn btn--primary" onClick=${onConfirm}>${action}</button>`}
          <button type="button" class="btn" onClick=${onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  `;
}
