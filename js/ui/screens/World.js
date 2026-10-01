import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { href } from '../app/router.js';
import { allTypes, createType } from '../../data/types.js';
import { worldCounts } from '../../data/entities.js';
import { Panel } from '../components/Panel.js';
import { RuledList, ListRow } from '../components/ListRow.js';
import { Button } from '../components/Button.js';
import { InlineForm } from '../components/InlineForm.js';
import { TypeManager } from './TypeManager.js';
import { reportError } from '../app/toasts.js';

// Types with counts, Stubs, and managing types and their fields (SPEC 5.2).
export function World() {
  const types = useLive(allTypes, [], []);
  const counts = useLive(worldCounts, [], { stubs: 0 });
  const [adding, setAdding] = useState(false);
  return html`
    <h1 class="page-title">${S.world.title}</h1>
    <${Panel}>
      <${RuledList} label=${S.world.title}>
        ${types.map((t) => html`<${ListRow} key=${t.id} title=${t.plural} href=${href('type', { typeId: t.id })} meta=${html`<span class="num">${counts[t.id] || 0}</span>`} />`)}
        <${ListRow} title=${S.world.stubs} href=${href('stubs')} meta=${html`<span class="num">${counts.stubs}</span>`} detail=${S.world.stubsHint} />
      <//>
    <//>
    <${Panel} title=${S.world.manage} titleId="manage-types" action=${!adding && html`<${Button} variant="quiet" onClick=${() => setAdding(true)}>${S.world.addType}<//>`}>
      ${adding && html`<${AddType} onDone=${() => setAdding(false)} />`}
      <${RuledList} label=${S.world.manage}>
        ${types.map((t) => html`<${TypeManager} key=${t.id} type=${t} types=${types} count=${counts[t.id] || 0} />`)}
      <//>
    <//>`;
}

function AddType({ onDone }) {
  const [label, setLabel] = useState('');
  const [plural, setPlural] = useState('');
  const [person, setPerson] = useState(false);
  const save = () => createType({ label: label.trim(), plural: plural.trim() || undefined, person }).then(onDone, reportError);
  return html`
    <${InlineForm} label=${S.world.addType} onSave=${save} onCancel=${onDone} canSave=${!!label.trim()}>
      <label class="field"><span class="field-label">${S.world.typeLabel}</span><input class="field-input" value=${label} onInput=${(e) => setLabel(e.currentTarget.value)} placeholder="Deity" /></label>
      <label class="field"><span class="field-label">${S.world.typePlural}</span><input class="field-input" value=${plural} onInput=${(e) => setPlural(e.currentTarget.value)} placeholder=${label ? `${label.trim()}s` : 'Deities'} /></label>
      <label class="check"><input type="checkbox" checked=${person} onChange=${(e) => setPerson(e.currentTarget.checked)} /> ${S.world.person}</label>
    <//>`;
}
