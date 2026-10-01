import { useState, useRef, useLayoutEffect, useMemo, useId } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { tap } from '../tap.js';
import { activeToken, suggestEntities, applyEntityPick, replaceToken, namedEntities, linkTarget, linkOccurrence } from '../../core/mentions.js';
import { suggestTags, typedTag } from '../../core/tags.js';
import { addNote } from '../../data/notes.js';
import { reportError } from '../app/toasts.js';
import { RecallStack } from './RecallStack.js';

// The one box (SPEC 4.2). Enter always saves; Tab or tap picks a suggestion; arrows move
// the highlight; Esc closes the list, a second Esc clears the box.
// cap: from useCapture(). recall: show recall cards and search results (in session).
// Edit mode: initial text and picks, onSubmit(typed, picks) instead of adding a note,
// and Esc (with no list open) calls onCancel.
export function CaptureBox({ cap, pcId, recall = false, placeholder, onSaved, boxRef, initial = '', initialPicks = [], onSubmit, onCancel, label = S.capture.label, autoFocus = false }) {
  const id = useId();
  const ownRef = useRef(null);
  const ref = boxRef ?? ownRef;
  const [text, setText] = useState(initial);
  const [caret, setCaret] = useState(0);
  const [hi, setHi] = useState(0);
  const [dismissed, setDismissed] = useState(null);
  const picks = useRef([...initialPicks]);
  const pendingCaret = useRef(null);

  // A pick sets the caret after the re-render. Typing cancels a pending restore, or a fast
  // tap-then-type would land letters in the wrong place (v1 bug: "odayt"; lesson 9).
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pendingCaret.current != null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      setCaret(pendingCaret.current);
      pendingCaret.current = null;
    }
    grow(el);
  }, [text]);

  const token = useMemo(() => activeToken(text, caret), [text, caret]);
  const open = !!token && token.start !== dismissed && !!cap;
  const items = useMemo(() => {
    if (!open) return [];
    if (token.kind === '@') return suggestEntities(token.query, cap.entities, 5).map((e) => ({ kind: '@', e }));
    return suggestTags(token.query, cap.tags, 5).map((t) => ({ kind: '#', t }));
  }, [open, token, cap]);
  const hint = open && token.kind === '@' && token.query && !items.length ? S.capture.newStub(token.query) : null;
  const sel = Math.min(hi, Math.max(items.length - 1, 0));

  const setBox = (next, nextCaret) => {
    pendingCaret.current = nextCaret;
    setText(next);
  };

  const pick = (item) => {
    if (!item || !token) return;
    if (item.kind === '@') {
      const r = applyEntityPick(text, token, item.e);
      if (r.pick) picks.current.push(r.pick);
      setBox(r.text, r.caret);
    } else {
      const r = replaceToken(text, token, typedTag(item.t.key));
      setBox(r.text, r.caret);
    }
    setHi(0);
    ref.current?.focus();
  };

  const link = (entity) => {
    const occ = linkTarget(text, entity.id, cap.nameIndex);
    if (!occ) return;
    const r = linkOccurrence(text, occ, entity);
    if (r.pick) picks.current.push(r.pick);
    setBox(r.text, r.caret);
    ref.current?.focus();
  };

  // Clears the box at once: at the table the next note often starts before the save
  // finishes, and those letters must not land on the end of the last one.
  // If the save fails, the text comes back (in front of anything typed since).
  const save = async () => {
    const typed = text;
    if (!typed.trim()) return;
    const p = picks.current;
    picks.current = [];
    pendingCaret.current = null;
    setText('');
    setDismissed(null);
    try {
      // Not `onSaved?.(await addNote(...))`: optional call skips its arguments too,
      // so the note would never be saved when there's no onSaved.
      const note = onSubmit ? await onSubmit(typed, p) : await addNote(typed, { picks: p, index: cap?.nameIndex });
      onSaved?.(note);
    } catch (err) {
      setText((t) => (t ? `${typed} ${t}` : typed));
      picks.current = [...p, ...picks.current];
      reportError(err);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Tab' && items.length) {
      e.preventDefault();
      pick(items[sel]);
    } else if (e.key === 'ArrowUp' && items.length) {
      // The list stacks bottom-up (best nearest the box), so Up goes to the next one.
      e.preventDefault();
      setHi((sel + 1) % items.length);
    } else if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setHi((sel - 1 + items.length) % items.length);
    } else if (e.key === 'Escape') {
      if (open && (items.length || hint)) setDismissed(token.start);
      else if (onCancel) onCancel();
      else {
        setText('');
        picks.current = [];
      }
    }
  };
  const onInput = (e) => {
    pendingCaret.current = null;
    setText(e.currentTarget.value);
    setCaret(e.currentTarget.selectionStart);
    setHi(0);
    if (dismissed != null && !activeToken(e.currentTarget.value, e.currentTarget.selectionStart)) setDismissed(null);
  };
  const trackCaret = (e) => setCaret(e.currentTarget.selectionStart);

  const cards = recall && cap ? cardIds({ text, token, open, items, sel, cap, pcId }) : [];
  const listId = `${id}-list`;

  return html`
    <div class="capture">
      ${recall && cap && html`<${RecallStack} text=${text} cards=${cards} cap=${cap} canLink=${(eid) => !!linkTarget(text, eid, cap.nameIndex)} onLink=${link} focusBox=${() => ref.current?.focus()} />`}
      ${(items.length > 0 || hint) && html`
        <ul class="suggest" id=${listId} role="listbox" aria-label=${S.capture.suggestions}>
          ${items.map((it, i) => html`
            <li key=${it.e?.id ?? it.t.key} id=${`${id}-o${i}`} role="option" aria-selected=${i === sel ? 'true' : 'false'} class=${`suggest-item${i === sel ? ' is-active' : ''}`} ...${tap(() => pick(it))}>
              ${it.kind === '@' ? html`<span>${it.e.name}</span><span class="suggest-meta">${it.e.stub ? S.recall.stub : cap.typesById.get(it.e.type_id)?.label ?? ''}</span>` : html`<span>#${it.t.key}</span><span class="suggest-meta">${it.t.count}</span>`}
            </li>`)}
          ${hint && html`<li class="suggest-hint" role="presentation">${hint}</li>`}
        </ul>`}
      <label class="sr-only" for=${id}>${label}</label>
      <textarea id=${id} ref=${ref} class="capture-input" rows="1" value=${text} placeholder=${placeholder}
        enterkeyhint="send" autocomplete="off" spellcheck="true"
        role="combobox" aria-expanded=${items.length ? 'true' : 'false'} aria-controls=${listId} aria-autocomplete="list"
        aria-activedescendant=${items.length ? `${id}-o${sel}` : undefined}
        autofocus=${autoFocus} onInput=${onInput} onKeyDown=${onKeyDown} onKeyUp=${trackCaret} onClick=${trackCaret} onSelect=${trackCaret}></textarea>
    </div>`;
}

// Cards: the highlighted @suggestion first, then names typed in plain text,
// most recently typed first; up to 3; never the player character (SPEC 4.5).
function cardIds({ text, token, open, items, sel, cap, pcId }) {
  const ids = [];
  if (open && token.kind === '@' && items[sel]) ids.push(items[sel].e.id);
  for (const e of namedEntities(text, cap.nameIndex, { exclude: [pcId], limit: 3 })) ids.push(e.id);
  return [...new Set(ids)].filter((x) => x !== pcId).slice(0, 3);
}

// Grows with its text up to a limit (CSS caps it), so long notes stay visible.
function grow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}
