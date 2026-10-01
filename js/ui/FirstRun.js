import { useState } from 'preact/hooks';
import { html } from './html.js';
import { createBundle } from '../db.js';
import { useUnpack } from './useUnpack.js';

// Shown when the app has no data: name a new character, or unpack a kit.
export function FirstRun() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState(null);
  const unpack = useUnpack(setMessage);

  async function onSubmit(e) {
    e.preventDefault();
    try {
      await createBundle(name);
    } catch (err) {
      setError(err.message);
    }
  }

  return html`
    <main class="results firstrun">
      <h1>Satchel</h1>
      <p>Notes for one character. Everything stays in this browser.</p>
      <form onSubmit=${onSubmit}>
        <label for="pc-name">Character name</label>
        <div class="row">
          <input id="pc-name" class="input" value=${name} autofocus
            onInput=${(e) => setName(e.currentTarget.value)} />
          <button class="btn" type="submit">Start</button>
        </div>
        ${error && html`<p class="badge badge--err">${error}</p>`}
      </form>
      <p>Already have a character? <button type="button" class="btn" onClick=${unpack.choose}>Unpack a kit</button></p>
      ${message && html`<p class=${`badge badge--${message.kind}`} role="status">${message.text}</p>`}
      ${unpack.view}
    </main>
  `;
}
