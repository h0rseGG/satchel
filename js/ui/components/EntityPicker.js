import { useState, useId, useMemo } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { suggestEntities } from '../../core/mentions.js';

// The one searchable entity list (SPEC 5.3 rule 4): merge target, relationship "with",
// link fields, file attach. A new name creates a stub via onCreate, like @mentions do.
// Picks happen on pointerdown so a phone keyboard stays open.
export function EntityPicker({ label, entities, onPick, onCreate, exclude = [], typeLabel = () => '', limit = 8, autofocus = false }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);

  const pool = useMemo(() => entities.filter((e) => !exclude.includes(e.id)), [entities, exclude.join()]);
  const list = useMemo(() => suggestEntities(query, pool, limit), [query, pool]);
  const name = query.trim();
  // Like the capture box (SPEC 4.2): "New stub" is offered only when nothing matches.
  const canCreate = !!onCreate && !!name && list.length === 0;
  const options = [...list.map((e) => ({ e })), ...(canCreate ? [{ create: name }] : [])];

  const choose = (o) => {
    if (!o) return;
    setQuery('');
    setHi(0);
    if (o.create) onCreate(o.create);
    else onPick(o.e);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(options[hi]); }
    else if (e.key === 'Escape') { setQuery(''); }
  };
  const down = (o) => (e) => { e.preventDefault(); choose(o); };

  return html`
    <div class="picker">
      <label class="field-label" for=${id}>${label}</label>
      <input id=${id} class="field-input" role="combobox" aria-expanded="true" aria-controls=${`${id}-list`} aria-autocomplete="list"
        aria-activedescendant=${options.length ? `${id}-o${hi}` : undefined}
        value=${query} placeholder=${S.picker.placeholder} autofocus=${autofocus}
        onInput=${(e) => { setQuery(e.currentTarget.value); setHi(0); }} onKeyDown=${onKeyDown} />
      <ul id=${`${id}-list`} class="picker-list" role="listbox" aria-label=${label}>
        ${options.map((o, i) => html`
          <li id=${`${id}-o${i}`} key=${o.e?.id ?? 'create'} role="option" aria-selected=${i === hi ? 'true' : 'false'}
            class=${`picker-option${i === hi ? ' is-active' : ''}`} onPointerDown=${down(o)}>
            ${o.create ? html`<span class="picker-new">${S.picker.newStub(o.create)}</span>` : html`<span>${o.e.name}</span><span class="picker-type">${o.e.stub ? 'stub' : typeLabel(o.e.type_id)}</span>`}
          </li>`)}
        ${!options.length && html`<li class="picker-empty">${S.picker.none}</li>`}
      </ul>
    </div>`;
}
