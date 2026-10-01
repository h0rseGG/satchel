import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { filesOf } from '../../data/files.js';
import { Panel } from './Panel.js';
import { FileGrid } from './FileGrid.js';
import { AddFiles } from './AddFiles.js';

// Files attached to an entity, with "Add file" attaching straight to it.
export function FilesPanel({ entity }) {
  const files = useLive(() => filesOf(entity.id), [entity.id], []);
  return html`
    <${Panel} title=${S.files.title} titleId="entity-files" action=${html`<${AddFiles} entityId=${entity.id} label=${S.files.addOne} variant="quiet" />`}>
      ${files.length === 0 ? html`<p class="muted">${S.files.empty}</p>` : html`<${FileGrid} files=${files} size=${96} label=${S.files.title} />`}
    <//>`;
}
