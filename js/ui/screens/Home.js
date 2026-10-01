import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { recentNotes } from '../../data/notes.js';
import { Panel } from '../components/Panel.js';
import { RuledList, ListRow } from '../components/ListRow.js';
import { NoteText } from '../components/NoteText.js';
import { when } from '../format.js';

// The hub. More panels arrive milestone by milestone (SPEC 5.2).
export function Home({ pc, cap }) {
  const notes = useLive(() => recentNotes(5), [], []);
  return html`
    <h1 class="page-title">${pc.name}</h1>
    <${Panel} title=${S.home.recent} titleId="home-recent">
      ${notes.length === 0 ? html`<p class="muted">${S.home.noNotes}</p>` : html`
        <${RuledList} label=${S.home.recent}>
          ${notes.map((n) => html`<${ListRow} key=${n.id} title=${cap ? html`<${NoteText} text=${n.text} byId=${cap.byId} />` : ''} meta=${when(n.created_at)} />`)}
        <//>`}
    <//>`;
}
