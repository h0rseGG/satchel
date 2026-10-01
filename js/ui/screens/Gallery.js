import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { ChipsField } from '../components/ChipsField.js';
import { Select } from '../components/Select.js';
import { EntityPicker } from '../components/EntityPicker.js';
import { ListRow, RuledList } from '../components/ListRow.js';
import { Panel } from '../components/Panel.js';
import { Card } from '../components/Card.js';
import { InlineForm } from '../components/InlineForm.js';
import { Thumb } from '../components/Thumb.js';
import { NoteText } from '../components/NoteText.js';
import { toast } from '../app/toasts.js';
import { confirmSheet } from '../app/confirm.js';
import { fieldValueError } from '../../core/types.js';

// Dev only (localhost): every component in its states, for the visual review (SPEC 5.4).
// Uses made-up data held in memory; nothing here touches the database.
const T = '2026-09-26T12:00:00.000Z';
const ENTS = [
  { id: 'g', name: 'Grimbold Ironhand', type_id: 'type-npc', updated_at: T },
  { id: 'a', name: 'Lord Aldric Thorne', type_id: 'type-npc', updated_at: T, tags: ['noble', 'fuck this guy', 'liar'] },
  { id: 'm', name: 'Mira Vane', type_id: 'type-npc', aliases: ['The Fox'], updated_at: T },
  { id: 'l', name: 'Lyra Ashdown', type_id: 'type-npc', updated_at: T },
  { id: 'h', name: 'Hollow King', type_id: null, stub: true, updated_at: T },
  { id: 'b', name: 'Thorne Mill', type_id: 'type-location', updated_at: T },
];
const BY_ID = new Map(ENTS.map((e) => [e.id, e]));
const TYPE = { 'type-npc': 'NPC', 'type-location': 'Location' };
const NOTES = [
  ['26 Sep 21:40', 'paid @[Grimbold](g) back the 20gp, ledger squared #debts'],
  ['26 Sep 20:45', '@[Mira](m)’s back. says she knew mum and that @[Lyra](l) is ALIVE #lyra'],
  ['19 Sep 21:05', 'they move "cargo" for someone called the @[Hollow King](h) #do_NOT_trust'],
];

export function Gallery() {
  const [text, setText] = useState('Owns the mill. Hired us.');
  const [num, setNum] = useState('12');
  const [chips, setChips] = useState(['noble', 'fuck this guy']);
  const [sel, setSel] = useState('ally');
  const [picked, setPicked] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [saves, setSaves] = useState(0);

  return html`
    <h1 class="page-title">Component gallery</h1>
    <p class="muted">Dev only. Every component from SPEC 5.4, with fake data.</p>

    <${Panel} title="Buttons" titleId="g-buttons">
      <div class="row-wrap">
        <${Button} variant="primary">Pack kit<//>
        <${Button}>Unpack kit<//>
        <${Button} variant="quiet">Edit<//>
        <${Button} variant="danger">Delete…<//>
        <${Button} variant="primary" disabled>Disabled<//>
      </div>
      <div class="row-wrap gallery-gap">
        <span class="badge badge-ok">Backed up</span>
        <span class="badge badge-grey">3 changes since backup</span>
        <span class="badge badge-warn">3 changes since backup</span>
        <span class="badge badge-err">Not backed up</span>
        <span><span class="seal" aria-hidden="true"></span>In session</span>
      </div>
    <//>

    <${Panel} title="Fields" titleId="g-fields">
      <${Field} label="Summary" value=${text} onSave=${(v) => { setText(v); setSaves((n) => n + 1); }} hint=${`Saved ${saves} times. Autosaves 0.7 s after you stop typing.`} />
      <${Field} label="Description" multiline value="Lying through his teeth. Rings on every finger." onSave=${() => {}} />
      <${Field} label="Crew (number)" value=${num} onSave=${setNum} validate=${(v) => fieldValueError('number', v)} />
      <${ChipsField} label="Tags" values=${chips} onSave=${setChips} placeholder="Add a tag" />
      <${Select} label="Relationship" value=${sel} onChange=${setSel} options=${['ally', 'rival', 'family', 'enemy', 'owes', 'works for'].map((v) => ({ value: v, label: v }))} />
    <//>

    <${Panel} title="Entity picker" titleId="g-picker">
      <${EntityPicker} label="With" entities=${ENTS} typeLabel=${(id) => TYPE[id] ?? ''} onPick=${(e) => setPicked(e.name)} onCreate=${(n) => setPicked(`new stub ${n}`)} />
      <p class="muted">Picked: ${picked || 'nothing yet'}</p>
    <//>

    <${Panel} title="Ruled list and inline form" titleId="g-list">
      <${RuledList} label="Notes">
        ${NOTES.map(([w, t]) => html`<${ListRow} key=${t} title=${html`<${NoteText} text=${t} byId=${BY_ID} />`} meta=${w} />`)}
        <${ListRow} title="Grimbold Ironhand" href="#/dev/gallery" meta="NPC" detail="Dwarf smith and moneylender. 10% a week."
          actions=${html`<${Button} variant="quiet" onClick=${() => setFormOpen(true)}>Add relationship<//>`}>
          ${formOpen && html`
            <${InlineForm} label="Add relationship" onSave=${() => { setFormOpen(false); toast('Relationship saved (gallery only).', { kind: 'ok' }); }} onCancel=${() => setFormOpen(false)}>
              <${Select} label="Type" value=${sel} onChange=${setSel} options=${['ally', 'rival', 'owes'].map((v) => ({ value: v, label: v }))} />
              <${EntityPicker} label="With" entities=${ENTS} typeLabel=${(id) => TYPE[id] ?? ''} onPick=${(e) => setPicked(e.name)} />
            <//>`}
        <//>
      <//>
    <//>

    <${Panel} title="Card" titleId="g-card">
      <${Card} title="Lord Aldric Thorne" sub="NPC" tags=${['noble', 'fuck this guy', 'liar']} aside="7 mentions">
        <p class="card-line">Owns the mill. Hired us. Lying through his teeth.</p>
        <p class="card-line card-small"><strong>Lord Aldric Thorne</strong> works for <strong>Hollow King</strong></p>
      <//>
    <//>

    <${Panel} title="Thumbs" titleId="g-thumbs">
      <div class="row-wrap">
        <${Thumb} file=${{ id: 'x', kind: 'text', name: 'Song of the Drowned Lantern.md' }} />
        <${Thumb} file=${{ id: 'y', kind: 'text', name: 'ledger.txt' }} size=${64} />
      </div>
    <//>

    <${Panel} title="Messages and confirm sheet" titleId="g-sheet">
      <div class="row-wrap">
        <${Button} onClick=${() => toast('Kit packed: wren-ashdown-2026-10-01-2130.kit', { kind: 'ok' })}>Toast: ok<//>
        <${Button} onClick=${() => toast('Kit unpacked into your satchel: 3 added, 1 updated.')}>Toast: info<//>
        <${Button} onClick=${() => toast('That file is over 10 MB.', { kind: 'err' })}>Toast: error<//>
        <${Button} variant="danger" onClick=${async () => toast((await confirmSheet({ title: 'Delete this note?', body: 'You can’t undo this.', confirmLabel: 'Delete' })) ? 'Confirmed' : 'Cancelled')}>Confirm<//>
        <${Button} variant="danger" onClick=${async () => toast((await confirmSheet({ title: 'Replace Wren Ashdown?', body: 'A backup kit downloads first.', confirmLabel: 'Replace', typeName: 'Wren Ashdown' })) ? 'Confirmed' : 'Cancelled')}>Confirm with name<//>
      </div>
    <//>`;
}
