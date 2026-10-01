import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { href } from '../app/router.js';
import { allFiles } from '../../data/files.js';
import { FileGrid } from '../components/FileGrid.js';
import { AddFiles } from '../components/AddFiles.js';

// Every file, newest first (SPEC 5.2).
export function Files() {
  const files = useLive(() => allFiles(), [], []);
  const opened = (rec, n) => { if (n === 1) location.hash = href('file', { id: rec.id }); };
  return html`
    <div class="page-head">
      <h1 class="page-title">${S.files.title}</h1>
      <${AddFiles} variant="primary" onAdded=${opened} />
    </div>
    ${files.length === 0 ? html`<p class="empty-line">${S.files.empty}</p>` : html`<${FileGrid} files=${files} label=${S.files.title} />`}`;
}
