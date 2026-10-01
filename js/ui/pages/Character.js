import { html } from '../html.js';
import { useLive } from '../useLive.js';
import { db, updateEntity, updateProfile } from '../../db.js';
import { href } from '../router.js';
import { TextField } from '../fields.js';

// Section labels and hints, in page order (after the one-line concept).
export const SECTIONS = [
  ['backstory', 'Backstory', 'Where they come from and what happened before the campaign.'],
  ['personality', 'Personality', 'How they come across: habits, manner, quirks.'],
  ['ideals', 'Ideals', 'What they believe in.'],
  ['bonds', 'Bonds', 'People, places and things they’re tied to.'],
  ['flaws', 'Flaws', 'Weaknesses, vices, fears.'],
  ['goals', 'Goals', 'What they want, short and long term.'],
  ['appearance', 'Appearance', ''],
  ['notes', 'Notes', 'Anything else.'],
];

// #/character: your character's roleplay page. No stats (D&D Beyond does those).
export function Character({ pcId }) {
  const pc = useLive(() => (pcId ? db.entities.get(pcId) : undefined), [pcId], undefined);
  if (!pc) return null;
  const profile = pc.profile ?? {};

  return html`
    <main class="page character">
      <p class="crumb"><a href=${href('/')}>← Dashboard</a></p>
      <div class="page__head"><h1 class="page__title">${pc.name}</h1></div>
      <div class="character__body">
        <${TextField} id="pc-name-field" label="Name" value=${pc.name} onSave=${(v) => updateEntity(pc.id, { name: v })} />
        <${TextField} id="pc-concept" label="Concept" value=${profile.concept}
          hint="One line: who they are, e.g. “Exiled ranger hunting his brother’s killer”."
          onSave=${(v) => updateProfile(pc.id, 'concept', v)} />
        ${SECTIONS.map(([key, label, hint]) => html`
          <${TextField} key=${key} id=${`pc-${key}`} label=${label} value=${profile[key]} hint=${hint} multiline
            onSave=${(v) => updateProfile(pc.id, key, v)} />
        `)}
      </div>
    </main>
  `;
}

// In session: a read-only overview for roleplay reference. Only filled-in
// sections are shown. Closing returns focus to the capture box, text intact.
export function CharacterOverview({ pc, onClose }) {
  const profile = pc?.profile ?? {};
  const filled = SECTIONS.filter(([key]) => (profile[key] ?? '').trim());
  const close = () => {
    onClose();
    document.querySelector('.capture__box')?.focus();
  };
  return html`
    <div class="overlay" onClick=${(e) => e.target === e.currentTarget && close()}
      onKeyDown=${(e) => e.key === 'Escape' && close()}>
      <div class="dialog overview" role="dialog" aria-modal="true" aria-label=${`${pc.name} overview`}>
        <h2 class="dialog__title">${pc.name}</h2>
        ${profile.concept && html`<p class="overview__concept">${profile.concept}</p>`}
        ${filled.length
          ? filled.map(([key, label]) => html`
              <section key=${key} class="overview__section">
                <h3>${label}</h3>
                <p>${profile[key]}</p>
              </section>`)
          : html`<p class="muted">Nothing written yet. Fill in the character page out of session.</p>`}
        <div class="row dialog__actions">
          <button type="button" class="btn" autofocus onClick=${close}>Close</button>
        </div>
      </div>
    </div>
  `;
}
