/**
 * Client entry for the prerendered guide pages.
 *
 * It renders nothing. The DOM inside #root is the final DOM, written at build
 * time by scripts/prerender.mjs — there is no React tree to hydrate, so there
 * is no mismatch to worry about and no flash by construction. This module
 * exists only to pull in the stylesheet and to report the page view.
 *
 * That is the whole reason guide.html is a separate Rollup entry: a guide
 * reader downloads roughly this file plus the CSS, instead of the entire
 * editor bundle they may never open.
 */
import '@/index.css';
import { track } from '@/core/analytics';

// bootstrap() inside track() also fires GA4's own page_view for this document.
// Note this is deliberately not `app_open` — the guide is not the app, and
// conflating the two would make the app-open metric meaningless.
track('view_change', { view: 'guide' });

// Escape returns to the editor, matching the old full-page guide overlay.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.location.href = '/';
});
