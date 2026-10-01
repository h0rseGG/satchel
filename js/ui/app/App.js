import { useState, useEffect, useRef } from 'preact/hooks';
import { html } from '../html.js';
import { S } from '../strings.js';
import { VERSION } from '../../version.js';

// M0 frame: top bar, menu with the build number, and a placeholder page.
export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return html`
    <header class="topbar">
      <a class="topbar-home" href="#/">${S.appName}</a>
      <div ref=${menuRef}>
        <button class="btn" aria-haspopup="true" aria-expanded=${menuOpen} onClick=${() => setMenuOpen(!menuOpen)}>${S.menu}</button>
        ${menuOpen && html`
          <div class="menu" role="menu" aria-label=${S.menu}>
            <div class="menu-version">${S.version(VERSION)}</div>
          </div>`}
      </div>
    </header>
    <main class="page">
      <h1 class="page-title">${S.appName}</h1>
      <p>${S.tagline}</p>
      <section class="panel">
        <h2 class="panel-title">Field journal</h2>
        <p class="muted">${S.underConstruction}</p>
      </section>
    </main>
  `;
}
