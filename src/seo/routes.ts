import { GUIDE_SECTIONS } from '@/guide/manifest';
import type { PageMeta } from './head';
import { guideHubGraph, guideSectionGraph, homeGraph } from './schema';
import { APP_DESCRIPTION } from './site';

/**
 * Every URL the build emits, with the metadata that describes it. Consumed by
 * src/prerender/entry-server.tsx, scripts/prerender.mjs and the sitemap
 * generator, so adding a page here is all it takes to get it prerendered,
 * indexed and listed.
 */

export type RouteKind = 'app' | 'guide' | 'error';

export interface Route {
  path: string;
  /** Which built HTML shell this page is spliced into. */
  shell: 'main' | 'guide';
  kind: RouteKind;
  meta: PageMeta;
  /** Sitemap fields. Omitted for pages that must not be listed. */
  sitemap?: { priority: string; lastmod: string };
}

const HOME_TITLE = 'GP200 Studio: Valeton GP-200 Editor & Loop Station in Your Browser';
const HOME_DESCRIPTION =
  'Free, open-source browser editor and multi-layer loop station for the Valeton GP-200. Edit presets, push changes live over USB-MIDI, and stack unlimited loops. No install, no backend.';

const GUIDE_DESCRIPTION =
  'The complete GP200 Studio guide: the pedalboard editor, the multi-layer loop station, footswitch and expression assignment, patch management and .prst files.';

/** Newest section lastmod, so the home page's sitemap entry tracks real edits. */
const NEWEST = GUIDE_SECTIONS.reduce(
  (latest, section) => (section.lastmod > latest ? section.lastmod : latest),
  GUIDE_SECTIONS[0].lastmod,
);

export const ROUTES: readonly Route[] = [
  {
    path: '/',
    shell: 'main',
    kind: 'app',
    sitemap: { priority: '1.0', lastmod: NEWEST },
    meta: {
      path: '/',
      title: HOME_TITLE,
      description: HOME_DESCRIPTION,
      ogType: 'website',
      jsonLd: homeGraph(),
    },
  },
  {
    path: '/guide',
    shell: 'guide',
    kind: 'guide',
    sitemap: { priority: '0.9', lastmod: NEWEST },
    meta: {
      path: '/guide',
      title: 'GP200 Studio Guide: Valeton GP-200, End to End',
      description: GUIDE_DESCRIPTION,
      ogType: 'article',
      jsonLd: guideHubGraph(),
    },
  },
  ...GUIDE_SECTIONS.map<Route>((section) => ({
    path: `/guide/${section.slug}`,
    shell: 'guide',
    kind: 'guide',
    sitemap: { priority: '0.7', lastmod: section.lastmod },
    meta: {
      path: `/guide/${section.slug}`,
      title: section.metaTitle,
      description: section.metaDescription,
      ogType: 'article',
      ogImage: section.ogImage,
      jsonLd: guideSectionGraph(section),
    },
  })),
  {
    // Served with a real 404 status by Workers Assets, and kept out of both
    // the sitemap and the index.
    path: '/404',
    shell: 'guide',
    kind: 'error',
    meta: {
      path: '/404',
      title: 'Page not found — GP200 Studio',
      description: APP_DESCRIPTION,
      ogType: 'website',
      robots: 'noindex, follow',
      jsonLd: [],
    },
  },
];

export const SITEMAP_ROUTES = ROUTES.filter((route) => route.sitemap);
