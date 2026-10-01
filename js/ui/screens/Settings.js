import { useState, useEffect } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { getMeta } from '../../data/meta.js';
import { persistState, askPersist } from '../../data/persist.js';
import { href } from '../app/router.js';
import { Panel } from '../components/Panel.js';
import { Button } from '../components/Button.js';
import { packKit, newCharacter } from '../app/kitActions.js';
import { when } from '../format.js';

// Backup status, storage persistence, types, and the danger zone (SPEC 5.2).
export function Settings() {
  const backup = useLive(() => getMeta('backup'), [], null);
  const [persist, setPersist] = useState(null);
  const [name, setName] = useState('');
  useEffect(() => { persistState().then(setPersist); }, []);
  if (!backup) return null;
  const ask = async () => { await askPersist(); setPersist(await persistState()); };

  return html`
    <h1 class="page-title">${S.settings.title}</h1>
    <${Panel} title=${S.settings.backup} titleId="set-backup">
      <p>${S.settings.lastExport(backup.last_backup_at && when(backup.last_backup_at))}
        ${' '}${backup.last_backup_at ? S.settings.unsaved(backup.changes_since_backup, when(backup.first_change_at)) : S.settings.unsavedNever(backup.changes_since_backup)}</p>
      <p><${Button} variant="primary" onClick=${() => packKit()}>${S.menu.packKit}<//></p>
      <p class="muted">${S.settings.devices}</p>
    <//>
    <${Panel} title=${S.settings.storage} titleId="set-storage">
      ${persist && html`<p>${persist.granted ? S.settings.persisted : S.settings.notPersisted}</p>
        ${!persist.granted && persist.supported && html`<p><${Button} variant="secondary" onClick=${ask}>${S.settings.askPersist}<//></p>`}`}
      <p class="muted">${S.settings.privateHint}</p>
    <//>
    <${Panel} title=${S.settings.types} titleId="set-types">
      <p><a class="btn btn-secondary" href=${href('world')}>${S.settings.manageTypes}</a></p>
    <//>
    <${Panel} title=${S.settings.danger} titleId="set-danger" class="danger-zone">
      <label class="field"><span class="field-label">${S.settings.newName}</span><input class="field-input" value=${name} onInput=${(e) => setName(e.currentTarget.value)} autocomplete="off" /></label>
      <${Button} variant="danger" disabled=${!name.trim()} onClick=${async () => { if (await newCharacter(name)) setName(''); }}>${S.settings.newCharacter}<//>
    <//>`;
}
