import { useEffect, useRef, useState } from 'preact/hooks';
import { html } from './html.js';

// The one box (D1). Enter saves, Shift+Enter is a new line, Esc clears.
export function CaptureBox({ onSave }) {
  const ref = useRef(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  // Grow with the content (CSS caps the height).
  useEffect(() => {
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => ref.current.focus(), []);

  async function onKeyDown(e) {
    if (e.key === 'Escape') {
      setText('');
      setError('');
      return;
    }
    // isComposing: Android keyboards may send Enter to finish a word first.
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    const toSave = text;
    if (!toSave.trim()) return;
    // Clear first so a fast double Enter can't save the same note twice.
    setText('');
    setError('');
    try {
      await onSave(toSave);
    } catch (err) {
      setText(toSave);
      setError(`Not saved: ${err.message}`);
    }
    ref.current.focus();
  }

  return html`
    <footer class="capture">
      ${error && html`<p class="badge badge--err capture__error">${error}</p>`}
      <textarea
        ref=${ref}
        class="capture__box"
        rows="1"
        enterkeyhint="send"
        placeholder="Type a note, press Enter"
        aria-label="Note"
        value=${text}
        onInput=${(e) => setText(e.currentTarget.value)}
        onKeyDown=${onKeyDown}
      ></textarea>
    </footer>
  `;
}
