import { OG_IMAGE, OG_IMAGE_ALT, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, SITE_NAME, abs } from './site';

/**
 * A pure `<head>` string builder, shared by scripts/prerender.mjs and the
 * tests.
 *
 * Deliberately not react-helmet (or any of its relatives): those mutate
 * document.head at runtime, which is precisely what prerendering exists to
 * avoid — a crawler that doesn't execute JavaScript would see the shell's head
 * instead. They also cannot set the head of a statically generated file at
 * all. A string builder can, and it is testable without a DOM.
 */

export interface PageMeta {
  /** Site-root-relative path, e.g. '/guide/loop-station'. */
  path: string;
  title: string;
  description: string;
  /**
   * Social-only description. Search shows ~155 characters, but X and LinkedIn
   * truncate around 125 — the two budgets conflict, so a page whose
   * `description` is tuned for the SERP can author a shorter one here.
   * Falls back to `description`.
   */
  ogDescription?: string;
  ogType: 'website' | 'article';
  /**
   * Site-root-relative image path. Falls back to the site OG card.
   *
   * Never a /guide/*.png: scripts/prerender.mjs strips those from the build, so
   * the URL would 404 and the preview would come out blank.
   */
  ogImage?: string;
  /** JSON-LD nodes for this page's single @graph. */
  jsonLd: unknown[];
  /** Overrides the default indexable robots directive. */
  robots?: string;
}

const DEFAULT_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * JSON-LD lives in a raw text element, so the only sequence that can break out
 * of it is a literal `</script`. HTML-escaping the whole payload would corrupt
 * the JSON, so escape just that.
 */
function jsonLdScript(nodes: unknown[]): string {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(
    /<\/script/gi,
    '<\\/script',
  );
  return `<script type="application/ld+json">${json}</script>`;
}

function meta(attr: 'name' | 'property', key: string, content: string): string {
  return `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
}

export function headFor(page: PageMeta): string {
  const canonical = abs(page.path);
  const image = page.ogImage ? abs(page.ogImage) : OG_IMAGE;
  const isPng = image.endsWith('.png');
  const isSiteCard = image === OG_IMAGE;
  const social = page.ogDescription ?? page.description;

  return [
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',

    `<title>${escapeHtml(page.title)}</title>`,
    meta('name', 'description', page.description),
    meta('name', 'author', 'Kabir Tamari'),
    meta('name', 'robots', page.robots ?? DEFAULT_ROBOTS),
    // Exactly one theme-color tag. The pre-paint script rewrites the first
    // match's content on load, so media-scoped light/dark variants would
    // break it — see the comment beside that script in index.html.
    '<meta name="theme-color" content="#e8e9eb" />',
    meta('name', 'apple-mobile-web-app-title', SITE_NAME),
    `<link rel="canonical" href="${canonical}" />`,

    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />',
    '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
    '<link rel="manifest" href="/site.webmanifest" />',
    // GA is injected on the first tracked event, so the lookup is on the
    // critical path. dns-prefetch rather than preconnect: preconnect would
    // spend a TLS handshake even for Global Privacy Control users, who never
    // load it at all.
    '<link rel="dns-prefetch" href="https://www.googletagmanager.com" />',

    meta('property', 'og:type', page.ogType),
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:title', page.title),
    meta('property', 'og:description', social),
    meta('property', 'og:url', canonical),
    meta('property', 'og:image', image),
    meta('property', 'og:image:secure_url', image),
    ...(isPng ? [meta('property', 'og:image:type', 'image/png')] : []),
    // Dimensions only for the site card, whose size is fixed and known. A
    // per-page image would need its own pair, and a wrong one renders worse
    // than none at all.
    ...(isSiteCard
      ? [
          meta('property', 'og:image:width', String(OG_IMAGE_WIDTH)),
          meta('property', 'og:image:height', String(OG_IMAGE_HEIGHT)),
        ]
      : []),
    meta('property', 'og:image:alt', OG_IMAGE_ALT),
    meta('property', 'og:locale', 'en_US'),

    // No twitter:site / twitter:creator: the project has no X account, and a
    // summary_large_image card renders correctly without them.
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', page.title),
    meta('name', 'twitter:description', social),
    meta('name', 'twitter:image', image),
    meta('name', 'twitter:image:alt', OG_IMAGE_ALT),

    jsonLdScript(page.jsonLd),
  ].join('\n    ');
}
