import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { getPc } from '../../data/characters.js';
import { updateEntity } from '../../data/entities.js';
import { PROFILE_SECTIONS, isDndBeyondUrl } from '../../core/model.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { Portrait } from '../components/Portrait.js';
import { DndBeyondButton } from '../components/DndBeyondButton.js';
import { reportError } from '../app/toasts.js';

// Your character: portrait, name, concept, D&D Beyond link, profile sections (SPEC 5.2).
// Each section saves on its own and stamps its own time, so merges keep edits from
// two devices to different sections (SPEC 3.1). Files and relationships join in M7/M8.
export function Character() {
  const pc = useLive(getPc, [], null);
  if (!pc) return null;
  const save = (patch) => updateEntity(pc.id, patch).catch(reportError);
  const section = (s) => (v) => save({ profile: { [s]: v } });
  return html`
    <div class="character-head">
      <${Portrait} entity=${pc} size=${132} />
      <div class="character-title">
        <h1 class="page-title">${pc.name}</h1>
        ${pc.profile?.concept && html`<p class="character-concept">${pc.profile.concept}</p>`}
        <${DndBeyondButton} url=${pc.dndbeyond_url} />
      </div>
    </div>
    <${Panel} title=${S.character.basics} titleId="char-basics">
      <${Field} label=${S.entity.name} value=${pc.name} onSave=${(v) => v.trim() && save({ name: v.trim() })} />
      <${Field} label=${S.overview.sections.concept} value=${pc.profile?.concept ?? ''} onSave=${section('concept')} />
      <${Field} label=${S.character.dndbeyond} value=${pc.dndbeyond_url ?? ''} inputType="url" placeholder="https://www.dndbeyond.com/characters/…"
        hint=${S.character.dndbeyondHint} validate=${(v) => (v.trim() && !isDndBeyondUrl(v) ? 'dndbeyond' : null)} onSave=${(v) => save({ dndbeyond_url: v.trim() })} />
    <//>
    <${Panel} title=${S.character.profile} titleId="char-profile">
      ${PROFILE_SECTIONS.filter((s) => s !== 'concept').map((s) => html`<${Field} key=${s} label=${S.overview.sections[s]} value=${pc.profile?.[s] ?? ''} multiline rows=${s === 'notes' || s === 'backstory' ? 6 : 3} onSave=${section(s)} />`)}
    <//>`;
}
