import { useState, useMemo } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { tap } from '../tap.js';
import { useLive } from '../useLive.js';
import { recallCard } from '../../data/recall.js';
import { updateEntity } from '../../data/entities.js';
import { getRecord } from '../../data/store.js';
import { shouldSearch, search } from '../../core/search.js';
import { NoteText } from './NoteText.js';
import { toast, reportError } from '../app/toasts.js';
import { when } from '../format.js';

const SEARCH_LIMIT = 4;

// Live results above the box, stacked bottom-up: the best match sits nearest the box,
// so the phone keyboard never hides it (SPEC 4.5).
export function RecallStack({ text, cards, cap, canLink, onLink, focusBox }) {
  const q = text.replace(/[@#]/g, ' ').replace(/_/g, ' ').trim();
  const hits = useMemo(() => {
    if (q.length < 2 || !shouldSearch(q)) return [];
    return search(cap.searchIndex, q, { limit: SEARCH_LIMIT + cards.length })
      .filter((r) => !(r.kind === 'entity' && cards.includes(r.ref)))
      .slice(0, SEARCH_LIMIT);
  }, [q, cap, cards.join()]);
  if (!cards.length && !hits.length) return null;
  return html`
    <div class="recall" aria-label=${S.capture.results} role="region">
      ${cards.map((id) => html`<${RecallCard} key=${id} id=${id} cap=${cap} canLink=${canLink(id)} onLink=${onLink} focusBox=${focusBox} />`)}
      ${hits.length > 0 && html`
        <ul class="recall-hits">
          ${hits.map((h) => html`<${Hit} key=${`${h.kind}:${h.ref}`} hit=${h} cap=${cap} />`)}
        </ul>`}
    </div>`;
}

function Hit({ hit, cap }) {
  const note = useLive(() => (hit.kind === 'note' ? getRecord('notes', hit.ref) : null), [hit.ref], null);
  if (hit.kind === 'entity') {
    const e = cap.byId.get(hit.ref);
    if (!e) return null;
    return html`<li class="recall-hit"><strong>${e.name}</strong> <span class="muted">${e.stub ? S.recall.stub : cap.typesById.get(e.type_id)?.label ?? ''}</span>${e.summary && html` · ${e.summary}`}</li>`;
  }
  if (!note) return null;
  return html`<li class="recall-hit"><span class="recall-when">${when(note.created_at)}</span> <${NoteText} text=${note.text} byId=${cap.byId} plain /></li>`;
}

function RecallCard({ id, cap, canLink, onLink, focusBox }) {
  const card = useLive(() => recallCard(id), [id], null);
  const [typing, setTyping] = useState(false);
  if (!card) return null;
  const e = card.entity;

  const setType = async (t) => {
    setTyping(false);
    try {
      await updateEntity(e.id, { type_id: t.id, stub: false });
      toast(S.recall.typeSet(e.name, t.label), { kind: 'ok' });
    } catch (err) {
      reportError(err);
    }
    focusBox();
  };

  const showFirst = !e.summary && card.mentionCount > 3 && card.firstMention;
  return html`
    <div class="card recall-card" data-entity=${e.id}>
      <div class="card-head">
        <strong class="card-title">${e.name}</strong>
        ${e.stub
          ? html`<button type="button" class="btn btn-quiet recall-stub" aria-label=${S.recall.setType(e.name)} aria-expanded=${typing ? 'true' : 'false'} ...${tap(() => setTyping(!typing))}>${S.recall.stub} ▾</button>`
          : html`<span class="card-sub">${card.type?.label ?? ''}</span>`}
        ${e.tags?.length > 0 && html`<span class="card-tags">${e.tags.join(', ')}</span>`}
        <span class="card-aside">${S.recall.mentions(card.mentionCount)}</span>
      </div>
      ${typing && html`
        <div class="recall-types" role="group" aria-label=${S.recall.setType(e.name)}>
          ${cap.types.filter((t) => t.id !== 'type-character').map((t) => html`<button type="button" key=${t.id} class="btn btn-secondary" ...${tap(() => setType(t))}>${t.label}</button>`)}
        </div>`}
      ${e.summary && html`<p class="card-line">${e.summary}</p>`}
      ${showFirst && html`<p class="card-line card-small"><span class="muted">${S.recall.firstMention}</span> <${NoteText} text=${card.firstMention.text} byId=${cap.byId} plain /></p>`}
      ${card.relationships.map((r) => html`<p class="card-line card-small" key=${r}>${r}</p>`)}
      ${card.lastMentions.length > 0 && html`
        <ul class="recall-mentions">
          ${card.lastMentions.map((n) => html`<li key=${n.id}><span class="recall-when">${when(n.created_at)}</span> <${NoteText} text=${n.text} byId=${cap.byId} plain /></li>`)}
        </ul>`}
      ${canLink && html`<div class="recall-actions"><button type="button" class="btn btn-secondary" aria-label=${S.recall.linkLabel(e.name)} ...${tap(() => onLink(e))}>${S.recall.link}</button></div>`}
    </div>`;
}
