import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from './html.js';
import { activeQuery, matchByName, suggest, typedForm } from '../mentions.js';
import { nameKey } from '../model.js';

// The one box (D1). Enter saves, Shift+Enter is a new line, Esc clears.
// While typing an @name: Tab or tap picks a suggestion, arrows move,
// Esc closes the list. Enter always saves (SPEC section 6).
export function CaptureBox({ entities, onSave }) {
  const ref = useRef(null);
  const caretAfterRender = useRef(null);
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState({});
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const q = dismissed ? null : activeQuery(text, caret);
  const options = q ? suggest(entities, q.query) : [];
  const isNew = q && q.query.trim() && !matchByName(entities, q.query);

  // Grow with the content (CSS caps the height); restore caret after a pick.
  useEffect(() => {
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    if (caretAfterRender.current !== null) {
      el.setSelectionRange(caretAfterRender.current, caretAfterRender.current);
      caretAfterRender.current = null;
    }
  }, [text]);

  useEffect(() => ref.current.focus(), []);

  // Caret moves (arrows, clicks) change which @token is active.
  function syncCaret(e) {
    setCaret(e.currentTarget.selectionStart);
  }

  function onInput(e) {
    setText(e.currentTarget.value);
    setCaret(e.currentTarget.selectionStart);
    setDismissed(false);
    setHighlight(0);
  }

  function pick(ent) {
    const insert = `${typedForm(ent.name)} `;
    const next = text.slice(0, q.start) + insert + text.slice(caret);
    const pos = q.start + insert.length;
    caretAfterRender.current = pos;
    setText(next);
    setCaret(pos);
    setPicked({ ...picked, [nameKey(ent.name)]: ent.id });
    setHighlight(0);
    ref.current.focus();
  }

  async function onKeyDown(e) {
    if (options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setHighlight((highlight + step + options.length) % options.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        pick(options[highlight] ?? options[0]);
        return;
      }
    }
    if (e.key === 'Escape') {
      if (q) {
        setDismissed(true);
        return;
      }
      setText('');
      setError('');
      return;
    }
    // isComposing: Android keyboards may send Enter to finish a word first.
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    const toSave = text;
    const toPick = picked;
    if (!toSave.trim()) return;
    // Clear first so a fast double Enter can't save the same note twice.
    setText('');
    setPicked({});
    setError('');
    try {
      await onSave(toSave, toPick);
    } catch (err) {
      setText(toSave);
      setPicked(toPick);
      setError(`Not saved: ${err.message}`);
    }
    ref.current.focus();
  }

  return html`
    <footer class="capture">
      ${(options.length > 0 || isNew) && html`
        <ul class="suggest" role="listbox" aria-label="Mention suggestions">
          ${options.map((ent, i) => html`
            <li
              key=${ent.id}
              role="option"
              class="suggest__item"
              aria-selected=${i === highlight}
              onPointerDown=${(e) => { e.preventDefault(); pick(ent); }}
            >
              <span>${ent.name}</span>
              <span class="muted">${ent.stub ? 'stub' : ent.type}</span>
            </li>
          `)}
          ${isNew && html`
            <li class="suggest__new muted">Enter saves with new stub: ${q.query.trim()}</li>
          `}
        </ul>
      `}
      ${error && html`<p class="badge badge--err capture__error">${error}</p>`}
      <textarea
        ref=${ref}
        class="capture__box"
        rows="1"
        enterkeyhint="send"
        placeholder="Type a note, press Enter. @ to mention."
        aria-label="Note"
        value=${text}
        onInput=${onInput}
        onKeyDown=${onKeyDown}
        onKeyUp=${syncCaret}
        onClick=${syncCaret}
      ></textarea>
    </footer>
  `;
}
