import { html } from '../html.js';
import { S } from '../strings.js';
import { Panel } from '../components/Panel.js';

// The hub. Its panels arrive milestone by milestone (SPEC 5.2).
export function Home({ pc }) {
  return html`
    <h1 class="page-title">${pc.name}</h1>
    <${Panel} title=${S.nav.character} titleId="home-character">
      <p class="muted">${S.underConstruction}</p>
    <//>`;
}
