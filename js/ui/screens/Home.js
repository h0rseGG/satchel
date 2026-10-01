import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { newest, inboxCount, worldCounts } from '../../core/notelists.js';
import { href } from '../app/router.js';
import { Portrait } from '../components/Portrait.js';
import { DndBeyondButton } from '../components/DndBeyondButton.js';
import { FileGrid } from '../components/FileGrid.js';
import { allFiles } from '../../data/files.js';
import { Panel } from '../components/Panel.js';
import { RuledList, ListRow } from '../components/ListRow.js';
import { NoteText } from '../components/NoteText.js';
import { when } from '../format.js';

// The hub. More panels arrive milestone by milestone (SPEC 5.2).
export function Home({ pc, cap }) {
  // From the capture store's notes in memory: no table scans on every write (M10).
  const notes = cap ? newest(cap.notes, 5) : [];
  const counts = cap ? worldCounts(cap.entities, pc.id) : { stubs: 0 };
  const types = cap?.types ?? [];
  const used = types.filter((t) => counts[t.id]);
  const inbox = cap ? inboxCount(cap.notes) : 0;
  const files = useLive(() => allFiles(6), [], []);
  return html`
    <h1 class="page-title">${pc.name}</h1>
    <${Panel} title=${S.character.title} titleId="home-character" class="home-character" action=${html`<a class="btn btn-quiet" href=${href('character')}>${S.character.page}</a>`}>
      <div class="home-character-body">
        <a href=${href('character')} aria-label=${S.character.page} tabindex="-1"><${Portrait} entity=${pc} size=${72} editable=${false} /></a>
        <div>
          <p class=${pc.profile?.concept ? 'home-concept' : 'home-concept muted'}>${pc.profile?.concept || S.character.noConcept}</p>
          <${DndBeyondButton} url=${pc.dndbeyond_url} />
        </div>
      </div>
    <//>
    <${Panel} title=${S.home.inbox} titleId="home-inbox">
      ${inbox === 0 ? html`<p class="muted">${S.inbox.empty}</p>` : html`<p class="home-big home-count"><span class="num">${inbox}</span> ${S.inbox.newNotes(inbox)} <a class="home-link" href=${href('inbox')}>${S.inbox.sortThem}</a></p>`}
    <//>
    <${Panel} title=${S.home.world} titleId="home-world" action=${html`<a class="btn btn-quiet" href=${href('world')}>${S.home.seeAll}</a>`}>
      ${used.length === 0 && !counts.stubs ? html`<p class="muted">${S.world.empty}</p>` : html`
        <ul class="count-list">
          ${used.map((t) => html`<li key=${t.id}><a href=${href('type', { typeId: t.id })}>${t.plural}</a> <span class="num">${counts[t.id]}</span></li>`)}
          ${counts.stubs > 0 && html`<li><a href=${href('stubs')}>${S.world.stubs}</a> <span class="num">${counts.stubs}</span></li>`}
        </ul>`}
    <//>
    <${Panel} title=${S.home.recent} titleId="home-recent" action=${html`<a class="btn btn-quiet" href=${href('notes')}>${S.home.allNotes}</a>`}>
      ${notes.length === 0 ? html`<p class="muted">${S.home.noNotes}</p>` : html`
        <${RuledList} label=${S.home.recent}>
          ${notes.map((n) => html`<${ListRow} key=${n.id} title=${cap ? html`<${NoteText} text=${n.text} byId=${cap.byId} />` : ''} meta=${when(n.created_at)} />`)}
        <//>`}
    <//>
    <${Panel} title=${S.files.recent} titleId="home-files" action=${html`<a class="btn btn-quiet" href=${href('files')}>${S.home.seeAll}</a>`}>
      ${files.length === 0 ? html`<p class="muted">${S.files.empty}</p>` : html`<${FileGrid} files=${files} size=${88} label=${S.files.recent} />`}
    <//>`;
}
