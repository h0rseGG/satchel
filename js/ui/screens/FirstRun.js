import { useState, useRef } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { Button } from '../components/Button.js';
import { createCharacter } from '../../data/characters.js';
import { askPersistOnce } from '../../data/persist.js';
import { unpackFirst, tryDemo } from '../app/kitActions.js';
import { reportError } from '../app/toasts.js';

// Name a new character · Unpack a kit · Try the demo character (SPEC 5.2).
export function FirstRun() {
  const [name, setName] = useState('');
  const file = useRef(null);
  const submit = (e) => {
    e.preventDefault();
    if (name.trim()) createCharacter(name).then(askPersistOnce, reportError);
  };
  const pick = (e) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (f) unpackFirst(f);
  };
  return html`
    <div class="first-run">
      <h1 class="page-title">${S.firstRun.title}</h1>
      <p>${S.tagline}</p>
      <form class="first-run-form" onSubmit=${submit}>
        <label class="field">
          <span class="field-label">${S.firstRun.nameLabel}</span>
          <input class="field-input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} autocomplete="off" />
        </label>
        <${Button} type="submit" variant="primary" disabled=${!name.trim()}>${S.firstRun.start}<//>
      </form>
      <p class="first-run-or muted">${S.firstRunMore.or}</p>
      <div class="first-run-option">
        <input ref=${file} type="file" class="sr-only" tabindex="-1" aria-hidden="true" onChange=${pick} />
        <${Button} variant="secondary" onClick=${() => file.current?.click()}>${S.firstRunMore.unpack}<//>
        <span class="muted">${S.firstRunMore.unpackHint}</span>
      </div>
      <div class="first-run-option">
        <${Button} variant="secondary" onClick=${tryDemo}>${S.firstRunMore.demo}<//>
        <span class="muted">${S.firstRunMore.demoHint}</span>
      </div>
    </div>`;
}
