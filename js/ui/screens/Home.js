import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { recentNotes } from '../../data/notes.js';
import { worldCounts } from '../../data/entities.js';
import { allTypes } from '../../data/types.js';
import { href } from '../app/router.js';
import { Panel } from '../components/Panel.js';
import { RuledList, ListRow } from '../components/ListRow.js';
import { NoteText } from '../components/NoteText.js';
import { when } from '../format.js';

// The hub. More panels arrive milestone by milestone (SPEC 5.2).
export function Home({ pc, cap }) {
  const notes = useLive(() => recentNotes(5), [], []);
  const counts = useLive(worldCounts, [], { stubs: 0 });
  const types = useLive(allTypes, [], []);
  const used = types.filter((t) => counts[t.id]);
  return html`
    <h1 class="page-title">${pc.name}</h1>
    <${Panel} title=${S.home.world} titleId="home-world" action=${html`<a class="btn btn-quiet" href=${href('world')}>${S.world.manage}</a>`}>
      ${used.length === 0 && !counts.stubs ? html`<p class="muted">${S.world.empty}</p>` : html`
        <ul class="count-list">
          ${used.map((t) => html`<li key=${t.id}><a href=${href('type', { typeId: t.id })}>${t.plural}</a> <span class="num">${counts[t.id]}</span></li>`)}
          ${counts.stubs > 0 && html`<li><a href=${href('stubs')}>${S.world.stubs}</a> <span class="num">${counts.stubs}</span></li>`}
        </ul>`}
    <//>
    <${Panel} title=${S.home.recent} titleId="home-recent">
      ${notes.length === 0 ? html`<p class="muted">${S.home.noNotes}</p>` : html`
        <${RuledList} label=${S.home.recent}>
          ${notes.map((n) => html`<${ListRow} key=${n.id} title=${cap ? html`<${NoteText} text=${n.text} byId=${cap.byId} />` : ''} meta=${when(n.created_at)} />`)}
        <//>`}
    <//>`;
}
