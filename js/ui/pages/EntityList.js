import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { useLive } from '../useLive.js';
import { db, createEntity } from '../../db.js';
import { live, nameKey } from '../../model.js';
import { href, go } from '../router.js';
import { LIST_KEYS, PLURAL, SINGULAR, listKeyOf } from '../labels.js';

// #/list/<key>: entities of one type (or the stubs), A–Z, with a filter
// and a quick "new" box.
export function EntityList({ parts, pcId, onMessage }) {
  const key = LIST_KEYS.includes(parts[1]) ? parts[1] : 'npc';
  const entities = useLive(async () => live(await db.entities.toArray()), [], []);
  const [filter, setFilter] = useState('');
  const [newName, setNewName] = useState('');

  const q = nameKey(filter);
  const rows = entities
    .filter((e) => e.id !== pcId && listKeyOf(e) === key)
    .filter((e) => !q || [e.name, ...(e.aliases ?? []), ...(e.tags ?? [])].some((s) => nameKey(s).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-AU', { sensitivity: 'base' }));

  async function create(e) {
    e.preventDefault();
    try {
      const ent = await createEntity({ name: newName, type: key === 'stub' ? 'unknown' : key });
      setNewName('');
      go(`/entity/${ent.id}`);
    } catch (err) {
      onMessage({ kind: 'err', text: err.message });
    }
  }

  return html`
    <main class="page">
      <p class="crumb"><a href=${href('/')}>← Dashboard</a></p>
      <div class="page__head">
        <h1 class="page__title">${PLURAL[key]}</h1>
        <span class="muted">${rows.length}${q ? ' matching' : ''}</span>
      </div>
      <div class="row list__tools">
        <input class="input" aria-label="Filter" placeholder="Filter by name, alias or tag" value=${filter}
          onInput=${(e) => setFilter(e.currentTarget.value)} />
      </div>
      ${key !== 'stub' && html`
        <form class="row list__tools" onSubmit=${create}>
          <input class="input" aria-label=${`New ${SINGULAR[key]} name`} placeholder=${`New ${SINGULAR[key]}…`}
            value=${newName} onInput=${(e) => setNewName(e.currentTarget.value)} />
          <button type="submit" class="btn">Add</button>
        </form>
      `}
      ${key === 'stub' && html`<p class="muted">Stubs come from @mentions. Open one to give it a type, or merge it into the right entity.</p>`}
      ${rows.length
        ? html`<ul class="list">
            ${rows.map((e) => html`
              <li key=${e.id}>
                <a class="list__row" href=${href(`/entity/${e.id}`)}>
                  <strong>${e.name}</strong>
                  ${e.tags?.length > 0 && html`<span class="muted">${e.tags.join(', ')}</span>`}
                  ${e.summary && html`<span class="list__summary">${e.summary}</span>`}
                </a>
              </li>
            `)}
          </ul>`
        : html`<p class="muted">${q ? 'Nothing matches.' : `No ${PLURAL[key].toLowerCase()} yet.`}</p>`}
    </main>
  `;
}
