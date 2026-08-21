import { renderToStaticMarkup } from 'react-dom/server';
import { Landing } from '@/components/Landing';
import { EditorShell } from './EditorShell';
import { GuideHub } from '@/guide/GuideHub';
import { GuideSectionPage } from '@/guide/GuideSection';
import { NotFound } from '@/guide/NotFound';
import { headFor } from '@/seo/head';
import { ROUTES, SITEMAP_ROUTES, type Route } from '@/seo/routes';
import { STUB_MIDI_DEVICE } from './stubMidiDevice';

/**
 * The only module Node imports from the app.
 *
 * Its import closure must stay SSR-clean: no module-scope window, document,
 * AudioContext, ResizeObserver or gsap. In practice that means it must never
 * import App.tsx, which pulls in PedalBoard → useFlipReorder (which calls
 * gsap.registerPlugin at module scope) and useAudioMeter (which reads
 * AudioContext.prototype). `Landing` and the guide tree are both clean, and
 * tests/unit/prerenderSafety.test.ts runs this file under a node environment
 * so a future import that breaks the rule fails a test rather than the build.
 *
 * renderToStaticMarkup rather than renderToString: the guide pages are never
 * hydrated (no React ships to them at all), and `/` is mounted with
 * createRoot, not hydrateRoot — so React's hydration markers would be dead
 * weight in every byte of every page.
 */

export interface RenderedPage {
  head: string;
  body: string;
  shell: Route['shell'];
}

/** Landing, rendered exactly as the app renders it, from a disconnected stub.
 *  Using the real component (not a hand-written copy) is what stops the static
 *  and live landing pages drifting apart. */
// This module is a Node build entry and is never part of a browser bundle, so
// fast refresh does not apply to it. Mixing a component with render() and
// sitemapXml() is the whole point of the file.
// eslint-disable-next-line react/only-export-components
function LandingPage() {
  return (
    <Landing
      midiDevice={STUB_MIDI_DEVICE}
      onOpenBlank={() => {}}
      onOpenCurrent={() => {}}
      loadError={null}
      onDismissError={() => {}}
    />
  );
}

function bodyFor(route: Route): string {
  if (route.path === '/') return renderToStaticMarkup(<LandingPage />);
  if (route.path === '/editor') return renderToStaticMarkup(<EditorShell />);
  if (route.path === '/404') return renderToStaticMarkup(<NotFound />);
  if (route.path === '/guide') return renderToStaticMarkup(<GuideHub />);
  const slug = route.path.replace('/guide/', '');
  return renderToStaticMarkup(<GuideSectionPage slug={slug} />);
}

export function render(path: string): RenderedPage {
  const route = ROUTES.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`No route registered for ${path}`);
  return { head: headFor(route.meta), body: bodyFor(route), shell: route.shell };
}

/** Paths to emit, in build order. */
export const ROUTE_PATHS: string[] = ROUTES.map((route) => route.path);

export function sitemapXml(): string {
  const urls = SITEMAP_ROUTES.map((route) => {
    const loc = `https://gp200studio.com${route.path === '/' ? '/' : route.path}`;
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <lastmod>${route.sitemap!.lastmod}</lastmod>`,
      '    <changefreq>monthly</changefreq>',
      `    <priority>${route.sitemap!.priority}</priority>`,
      '  </url>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
