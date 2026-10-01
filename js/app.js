// Skeleton entry point. Real app wiring (Preact, Dexie) arrives in build step 3.

const box = document.querySelector('.capture__box');

// Keep the capture box focused on desktop. On Android the keyboard only
// opens after a tap, so this is best effort (SPEC section 2, risk 5).
box.focus();

// Secure-context check: crypto.randomUUID and the service worker need
// HTTPS or localhost. Opening index.html straight from disk will fail here.
if (!window.isSecureContext) {
  document.querySelector('.results').insertAdjacentHTML(
    'beforeend',
    '<p class="badge badge--err">Not a secure context. Run via python -m http.server or HTTPS.</p>'
  );
}
