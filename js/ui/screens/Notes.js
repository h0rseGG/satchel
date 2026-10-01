import { useState, useEffect, useMemo } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useCapture } from '../useCapture.js';
import { filterNotes } from '../../core/notelists.js';
import { search } from '../../core/search.js';
import { NoteRow } from '../components/NoteRow.js';
import { RuledList } from '../components/ListRow.js';
import { Select } from '../components/Select.js';
import { Button } from '../components/Button.js';
import { EntityPicker } from '../components/EntityPicker.js';

const PAGE = 100;
const MODES = ['all', 'in', 'out'];

// All notes, newest first, filtered by text, tag, mode or a mentioned entity (SPEC 5.2).
// A tag chip elsewhere opens this filtered: #/notes?tag=debts
export function Notes({ query, pc }) {
  const cap = useCapture();
  const [text, setText] = useState('');
  const [tag, setTag] = useState(query.tag ?? '');
  const [mode, setMode] = useState(query.mode ?? 'all');
  const [entity, setEntity] = useState(query.entity ?? '');
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setTag(query.tag ?? ''); setMode(query.mode ?? 'all'); setEntity(query.entity ?? ''); }, [query.tag, query.mode, query.entity]);
  useEffect(() => setLimit(PAGE), [text, tag, mode, entity]);

  const notes = useMemo(() => (cap ? filterNotes(cap.notes, { mode, tag, entity }) : []), [cap, mode, tag, entity]);
  const shown = useMemo(() => {
    const q = text.trim();
    if (!q || !cap) return notes;
    const hits = new Set(search(cap.searchIndex, q, { kind: 'note', limit: 5000 }).map((r) => r.ref));
    return notes.filter((n) => hits.has(n.id));
  }, [notes, text, cap]);

  const tags = cap ? [...cap.tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : [];
  const who = entity && cap?.byId.get(entity);
  const filtered = text || tag || mode !== 'all' || entity;
  const typeLabel = (id) => cap?.typesById.get(id)?.label ?? '';

  return html`
    <h1 class="page-title">${S.notes.title}</h1>
    <div class="notes-filters">
      <label class="field"><span class="sr-only">${S.notes.filterText}</span><input class="field-input" type="search" placeholder=${S.notes.filterText} value=${text} onInput=${(e) => setText(e.currentTarget.value)} /></label>
      <div class="row-wrap">
        <${Select} label=${S.notes.tag} value=${tag} onChange=${setTag} options=${[{ value: '', label: S.notes.anyTag }, ...tags.map(([k, n]) => ({ value: k, label: `#${k} (${n})` })), ...(tag && !tags.some(([k]) => k === tag) ? [{ value: tag, label: `#${tag}` }] : [])]} />
        <div class="field">
          <span class="field-label">${S.notes.mode}</span>
          <div class="segmented" role="group" aria-label=${S.notes.mode}>
            ${MODES.map((m) => html`<button type="button" key=${m} class=${`segmented-btn${mode === m ? ' is-on' : ''}`} aria-pressed=${mode === m ? 'true' : 'false'} onClick=${() => setMode(m)}>${S.inbox[m]}</button>`)}
          </div>
        </div>
      </div>
      ${who ? html`<p class="filter-chip">${S.notes.entity}: <span class="mention">${who.name}</span> <${Button} variant="quiet" onClick=${() => setEntity('')}>${S.entity.clear}<//></p>`
        : cap && html`<details class="notes-entity"><summary>${S.notes.entity}…</summary><${EntityPicker} label=${S.notes.entity} entities=${cap.entities} typeLabel=${typeLabel} onPick=${(e) => setEntity(e.id)} limit=${6} /></details>`}
      ${filtered && html`<p class="muted notes-count">${S.notes.shown(Math.min(limit, shown.length), shown.length)} <${Button} variant="quiet" onClick=${() => { setText(''); setTag(''); setMode('all'); setEntity(''); }}>${S.notes.clear}<//></p>`}
    </div>
    ${shown.length === 0 ? html`<p class="muted">${notes.length || filtered ? S.notes.none : S.home.noNotes}</p>` : html`
      <${RuledList} label=${S.notes.title}>
        ${shown.slice(0, limit).map((n) => html`<${NoteRow} key=${n.id} note=${n} cap=${cap} pcId=${pc.id} />`)}
      <//>
      ${shown.length > limit && html`<${Button} variant="secondary" onClick=${() => setLimit(limit + PAGE)}>${S.notes.more(Math.min(PAGE, shown.length - limit))}<//>`}`}`;
}
