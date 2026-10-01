import { html } from '../html.js';
import { S } from '../strings.js';
import { Button } from './Button.js';

// The one inline-form pattern (SPEC 5.3 rule 3): opens under its row, Save/Cancel.
// Never a pop-up for adding.
export function InlineForm({ label, onSave, onCancel, saveLabel = S.common.save, canSave = true, children }) {
  const submit = (e) => {
    e.preventDefault();
    if (canSave) onSave?.();
  };
  const onKeyDown = (e) => { if (e.key === 'Escape') onCancel?.(); };
  return html`
    <form class="inline-form" aria-label=${label} onSubmit=${submit} onKeyDown=${onKeyDown}>
      ${children}
      <div class="inline-form-actions">
        <${Button} type="submit" variant="primary" disabled=${!canSave}>${saveLabel}<//>
        <${Button} variant="quiet" onClick=${onCancel}>${S.common.cancel}<//>
      </div>
    </form>`;
}
