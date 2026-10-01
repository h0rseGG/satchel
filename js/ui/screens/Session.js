import { useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { useLive } from '../useLive.js';
import { useCapture } from '../useCapture.js';
import { notesSince } from '../../data/notes.js';
import { CaptureBox } from '../components/CaptureBox.js';
import { NoteText } from '../components/NoteText.js';
import { Overview } from './Overview.js';
import { time } from '../format.js';

// The capture screen (SPEC 5.2): this session's notes, live recall, one box.
// Shown on every address while in session.
export function Session({ pc, session, overview, onCloseOverview }) {
  const cap = useCapture();
  const notes = useLive(() => notesSince(session.mode_since), [session.mode_since], []);
  const box = useRef(null);
  const feed = useRef(null);

  useEffect(() => { if (!overview) box.current?.focus(); }, [overview]);
  // Newest at the bottom, next to the box.
  useLayoutEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [notes.length, overview]);

  const close = () => {
    onCloseOverview();
    box.current?.focus();
  };

  return html`
    <div class="session">
      <div class="session-feed" ref=${feed}>
        ${overview ? html`<${Overview} pc=${pc} onClose=${close} />` : html`
          <section aria-label=${S.feed.label} class="feed">
            ${notes.length === 0 ? html`<p class="feed-empty muted">${S.feed.empty}</p>` : html`
              <ol class="feed-list">
                ${notes.map((n) => html`<li key=${n.id} class="feed-item"><span class="feed-when">${time(n.created_at)}</span><span class="feed-text">${cap && html`<${NoteText} text=${n.text} byId=${cap.byId} plain />`}</span></li>`)}
              </ol>`}
          </section>`}
      </div>
      <div class="session-box">
        <${CaptureBox} cap=${cap} pcId=${pc.id} recall boxRef=${box} placeholder=${S.capture.placeholderIn} />
      </div>
    </div>`;
}
