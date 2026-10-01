import { useState } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { Button } from '../components/Button.js';
import { createCharacter } from '../../data/characters.js';
import { reportError } from '../app/toasts.js';

// Name a new character. (Unpack a kit and Try the demo character join this screen in M9.)
export function FirstRun() {
  const [name, setName] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (name.trim()) createCharacter(name).catch(reportError);
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
    </div>`;
}
