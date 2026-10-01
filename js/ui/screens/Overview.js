import { html } from '../html.js';
import { S } from '../strings.js';
import { PROFILE_SECTIONS, isDndBeyondUrl } from '../../core/model.js';
import { Button } from '../components/Button.js';
import { DndBeyondButton } from '../components/DndBeyondButton.js';

// The in-session character overview: tap your name in the top bar. Read-only;
// edit it on the character page afterwards.
export function Overview({ pc, onClose }) {
  const filled = PROFILE_SECTIONS.filter((s) => pc.profile?.[s]?.trim());
  return html`
    <section class="overview" aria-labelledby="overview-title">
      <div class="overview-head">
        <h1 class="page-title" id="overview-title">${pc.name}</h1>
        <${Button} variant="secondary" onClick=${onClose}>${S.overview.close}<//>
      </div>
      ${isDndBeyondUrl(pc.dndbeyond_url) && html`<p><${DndBeyondButton} url=${pc.dndbeyond_url} /></p>`}
      ${filled.length === 0 ? html`<p class="muted">${S.overview.empty}</p>` : filled.map((s) => html`
        <div class="overview-section" key=${s}>
          <h2 class="overview-label">${S.overview.sections[s]}</h2>
          <p class="overview-text">${pc.profile[s]}</p>
        </div>`)}
    </section>`;
}
