import { useMemo, useState } from 'preact/hooks';
import { html } from '../html.js';
import { useLive } from '../useLive.js';
import { db, deleteEntity, mergeEntities, updateEntity } from '../../db.js';
import { ENTITY_TYPES, live, nameKey } from '../../model.js';
import { href, go } from '../router.js';
import { PLURAL, SINGULAR, listKeyOf } from '../labels.js';
import { ChipsField, Confirm, TextField } from '../fields.js';
import { NoteText } from '../NoteText.js';
import { formatShort } from '../format.js';
import { AddFiles, Portrait, ThumbGrid } from '../files.js';

const TYPES = ENTITY_TYPES.filter((t) => t !== 'unknown');

// #/entity/<id>: edit everything about one entity; merge or delete it.
export function Entity({ parts, pcId, onMessage }) {
  const id = parts[1];
  const entity = useLive(() => db.entities.get(id), [id], undefined);
  const entities = useLive(async () => live(await db.entities.toArray()), [], []);
  const notes = useLive(async () => live(await db.notes.where('mentions').equals(id).toArray()), [id], []);
  const files = useLive(async () => live(await db.files.where('entity_id').equals(id).toArray())
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [id], []);
  const [dialog, setDialog] = useState(null); // 'merge' | 'delete'

  const names = useMemo(() => new Map(entities.map((e) => [e.id, e.name])), [entities]);

  if (entity === undefined) return null; // loading
  if (!entity) return html`<main class="page"><p>Not found. <a href=${href('/')}>Dashboard</a></p></main>`;
  if (entity.deleted) {
    return html`<main class="page">
      <p class="crumb"><a href=${href('/')}>← Dashboard</a></p>
      <p>${entity.name} was ${entity.merged_into ? 'merged into ' : 'deleted.'}
        ${entity.merged_into && html`<a href=${href(`/entity/${entity.merged_into}`)}>${names.get(entity.merged_into) ?? 'another entity'}</a>.`}</p>
    </main>`;
  }
  if (id === pcId) {
    return html`<main class="page"><p>This is your character. <a href=${href('/character')}>Open the character page</a>.</p></main>`;
  }

  const save = (changes) => updateEntity(id, changes);
  const key = listKeyOf(entity);
  const sorted = [...notes].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return html`
    <main class="page entity">
      <p class="crumb"><a href=${href('/')}>Dashboard</a> / <a href=${href(`/list/${key}`)}>${PLURAL[key]}</a></p>
      <div class="page__head">
        <h1 class="page__title">${entity.name}</h1>
        <span class="muted">${entity.stub ? 'stub' : SINGULAR[entity.type]}</span>
      </div>

      <div class="entity__grid">
        <section class="entity__fields" aria-label="Details">
          <${TextField} id="ent-name" label="Name" value=${entity.name} onSave=${(v) => save({ name: v })} />
          <div class="field">
            <label for="ent-type">Type</label>
            <select id="ent-type" class="input field__input" value=${entity.stub ? '' : entity.type}
              onChange=${(e) => e.currentTarget.value && save({ type: e.currentTarget.value })}>
              ${entity.stub && html`<option value="" disabled>stub (choose a type)</option>`}
              ${TYPES.map((t) => html`<option value=${t}>${SINGULAR[t]}</option>`)}
            </select>
          </div>
          <${ChipsField} id="ent-tags" label="Tags" values=${entity.tags} onSave=${(v) => save({ tags: v })}
            placeholder="Add a tag…" />
          <${ChipsField} id="ent-aliases" label="Also known as" values=${entity.aliases} onSave=${(v) => save({ aliases: v })}
            placeholder="Add a name…" hint="Other names: typing one of these in a note links here." />
          <${TextField} id="ent-summary" label="Summary" value=${entity.summary} onSave=${(v) => save({ summary: v })}
            hint="One line, shown on recall cards." />
          <${TextField} id="ent-body" label="Description" value=${entity.body} multiline onSave=${(v) => save({ body: v })} />
          <div class="row entity__actions">
            <button type="button" class="btn" onClick=${() => setDialog('merge')}>Merge into…</button>
            <button type="button" class="btn btn--danger" onClick=${() => setDialog('delete')}>Delete…</button>
          </div>
        </section>

        <section class="entity__notes" aria-label="Notes mentioning this">
          <${Portrait} entity=${entity} className="portrait portrait--entity" />
          <div class="page__head">
            <h2 class="panel__title">Files (${files.length})</h2>
            <${AddFiles} entityId=${entity.id} label="Add files…" onMessage=${onMessage} />
          </div>
          ${files.length > 0 && html`<${ThumbGrid} files=${files} />`}
          <h2 class="panel__title">Mentioned in ${sorted.length} note${sorted.length === 1 ? '' : 's'}</h2>
          <ul class="card__mentions">
            ${sorted.map((n) => html`
              <li key=${n.id}>
                <span class="muted card__when">${formatShort(n.created_at)}</span>
                <span class="card__text"><${NoteText} text=${n.text} names=${names} links /></span>
              </li>
            `)}
          </ul>
        </section>
      </div>

      ${dialog === 'merge' && html`<${MergePicker} entity=${entity} entities=${entities} pcId=${pcId}
        onCancel=${() => setDialog(null)}
        onMerge=${async (target) => {
          setDialog(null);
          try {
            await mergeEntities(entity.id, target.id);
            onMessage({ kind: 'ok', text: `Merged ${entity.name} into ${target.name}.` });
            go(`/entity/${target.id}`);
          } catch (err) {
            onMessage({ kind: 'err', text: `Merge failed, nothing changed: ${err.message}` });
          }
        }} />`}

      ${dialog === 'delete' && html`<${Confirm} title=${`Delete ${entity.name}?`} action="Delete" danger
        onCancel=${() => setDialog(null)}
        onConfirm=${async () => {
          setDialog(null);
          await deleteEntity(entity.id);
          onMessage({ kind: 'ok', text: `Deleted ${entity.name}. Notes keep the name as plain text.` });
          go(`/list/${key}`);
        }}>
        <p>Notes that mention ${entity.name} keep the name as plain text. To combine duplicates, use Merge instead.</p>
      </${Confirm}>`}
    </main>
  `;
}

// Pick the entity to merge into, then confirm.
function MergePicker({ entity, entities, pcId, onMerge, onCancel }) {
  const [filter, setFilter] = useState('');
  const [target, setTarget] = useState(null);
  const q = nameKey(filter);
  const options = entities
    .filter((e) => e.id !== entity.id && e.id !== pcId)
    .filter((e) => !q || [e.name, ...(e.aliases ?? [])].some((s) => nameKey(s).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-AU', { sensitivity: 'base' }))
    .slice(0, 30);

  if (target) {
    return html`<${Confirm} title=${`Merge ${entity.name} into ${target.name}?`} action="Merge"
      onCancel=${onCancel} onConfirm=${() => onMerge(target)}>
      <p>${entity.name} becomes another name for ${target.name}. Its notes, tags and description move over, and other devices follow when they sync.</p>
    </${Confirm}>`;
  }
  return html`
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && onCancel()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Merge into">
        <h2 class="dialog__title">Merge ${entity.name} into…</h2>
        <input class="input dialog__input" aria-label="Find entity" placeholder="Type a name" autofocus
          value=${filter} onInput=${(e) => setFilter(e.currentTarget.value)} />
        <ul class="list pick">
          ${options.map((e) => html`
            <li key=${e.id}><button type="button" class="list__row pick__row" onClick=${() => setTarget(e)}>
              <strong>${e.name}</strong> <span class="muted">${e.stub ? 'stub' : SINGULAR[e.type]}</span>
            </button></li>
          `)}
        </ul>
        <div class="row dialog__actions"><button type="button" class="btn" onClick=${onCancel}>Cancel</button></div>
      </div>
    </div>
  `;
}
