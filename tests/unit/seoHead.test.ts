import { describe, it, expect } from 'vitest';
import { escapeHtml, headFor } from '@/seo/head';
import { ROUTES, SITEMAP_ROUTES } from '@/seo/routes';
import { OG_IMAGE, ORIGIN } from '@/seo/site';

/**
 * Guards the metadata that decides how every page is indexed. The head is a
 * pure string builder precisely so this can be asserted without a browser or
 * a build.
 */

const heads = ROUTES.map((route) => [route.path, headFor(route.meta), route] as const);

const metas = ROUTES.map((route) => [route.path, route.meta] as const);

function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

function attr(html: string, pattern: RegExp): string | undefined {
  return html.match(pattern)?.[1];
}

describe('seo head', () => {
  it('covers the home page, the guide hub, 13 sections and a 404', () => {
    expect(ROUTES).toHaveLength(16);
    expect(SITEMAP_ROUTES).toHaveLength(15);
  });

  it.each(heads)('%s has exactly one title and canonical', (_path, html) => {
    expect(count(html, /<title>/g)).toBe(1);
    expect(count(html, /rel="canonical"/g)).toBe(1);
    expect(count(html, /name="description"/g)).toBe(1);
  });

  it.each(heads)('%s is canonical on the apex domain', (path, html) => {
    const canonical = attr(html, /rel="canonical" href="([^"]+)"/);
    expect(canonical).toBe(`${ORIGIN}${path}`);
    // A canonical that disagrees with og:url is a classic way to hand social
    // crawlers and search crawlers two different "real" URLs.
    expect(attr(html, /property="og:url" content="([^"]+)"/)).toBe(canonical);
  });

  it.each(heads)('%s attributes the author', (_path, html) => {
    expect(html).toContain('content="Kabir Tamari"');
  });

  it('marks only the 404 page noindex', () => {
    for (const [path, html] of heads) {
      const robots = attr(html, /name="robots" content="([^"]+)"/) ?? '';
      expect(robots.includes('noindex')).toBe(path === '/404');
    }
  });

  it('omits Twitter account tags, which the project does not have', () => {
    for (const [, html] of heads) {
      expect(html).not.toContain('twitter:site');
      expect(html).not.toContain('twitter:creator');
    }
  });

  it('declares exactly one theme-color, which the pre-paint script rewrites', () => {
    for (const [, html] of heads) {
      expect(count(html, /name="theme-color"/g)).toBe(1);
    }
  });

  it.each(heads)('%s emits parseable JSON-LD', (_path, html) => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(blocks).toHaveLength(1);
    expect(() => JSON.parse(blocks[0][1])).not.toThrow();
  });

  it('defines every @id its graph references', () => {
    const defined = new Set<string>();
    const referenced: string[] = [];

    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      const id = record['@id'];
      if (typeof id === 'string') {
        // A lone @id is a reference; anything else is a definition.
        if (Object.keys(record).length === 1) referenced.push(id);
        else defined.add(id);
      }
      for (const [key, value] of Object.entries(record)) {
        if (key !== '@id') walk(value);
      }
    };

    for (const route of ROUTES) walk(route.meta.jsonLd);
    expect(referenced.filter((id) => !defined.has(id))).toEqual([]);
  });

  it('never lets a </script> in the data break out of the JSON-LD block', () => {
    const payload = '</script><script>alert(1)</script>';
    const html = headFor({
      path: '/',
      title: 'x',
      description: 'y',
      ogType: 'website',
      jsonLd: [{ '@type': 'Thing', name: payload }],
    });

    // A <script> element is a raw text element: the ONLY thing that can end it
    // early is a literal `</script`. An opening tag inside is inert, so that is
    // the one sequence that must be escaped — and escaping the rest would
    // corrupt the JSON.
    expect(html).not.toContain('</script><script>alert(1)');
    expect(count(html, /<\/script>/g)).toBe(1);

    // The value must survive the escaping intact, or the schema is now a lie.
    const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    const parsed = JSON.parse(block) as { '@graph': { name: string }[] };
    expect(parsed['@graph'][0].name).toBe(payload);
  });

  /**
   * The lengths crawlers actually enforce. Counted on the ESCAPED title,
   * because that is the string that ships: a literal '&' becomes '&amp;' and
   * burns four of the ~60 characters a result gets, for one glyph nobody sees.
   */
  it.each(metas)('%s fits the ~60-character title budget once escaped', (_path, meta) => {
    expect(escapeHtml(meta.title).length).toBeLessThanOrEqual(60);
  });

  it.each(metas)('%s fits the ~160-character SERP description budget', (_path, meta) => {
    expect(escapeHtml(meta.description).length).toBeLessThanOrEqual(160);
  });

  it('keeps every authored social description inside the ~125 a card shows', () => {
    for (const [, meta] of metas) {
      if (!meta.ogDescription) continue;
      expect(escapeHtml(meta.ogDescription).length).toBeLessThanOrEqual(125);
    }
  });

  it('sends the short description to social and the long one to search', () => {
    const home = ROUTES.find((route) => route.path === '/')!.meta;
    expect(home.ogDescription).toBeTruthy();

    const html = headFor(home);
    expect(attr(html, /property="og:description" content="([^"]+)"/)).toBe(home.ogDescription);
    expect(attr(html, /name="twitter:description" content="([^"]+)"/)).toBe(home.ogDescription);
    expect(attr(html, /name="description" content="([^"]+)"/)).toBe(home.description);
  });

  it('falls back to the search description when no social one is authored', () => {
    const guide = ROUTES.find((route) => route.path === '/guide')!.meta;
    expect(guide.ogDescription).toBeUndefined();
    expect(attr(headFor(guide), /property="og:description" content="([^"]+)"/)).toBe(
      guide.description,
    );
  });

  /**
   * scripts/prerender.mjs strips dist/guide/*.png at the end of the build, so
   * an og:image pointing there 404s and the preview comes out blank. Eight
   * section pages shipped exactly that way before this guard existed.
   */
  it.each(heads)('%s never points og:image at a stripped guide PNG', (_path, html) => {
    expect(attr(html, /property="og:image" content="([^"]+)"/)).not.toMatch(/\/guide\/.*\.png$/);
  });

  it.each(heads)('%s declares dimensions whenever it uses the site card', (_path, html) => {
    const image = attr(html, /property="og:image" content="([^"]+)"/);
    const width = attr(html, /property="og:image:width" content="([^"]+)"/);
    const height = attr(html, /property="og:image:height" content="([^"]+)"/);
    // A per-page image would need its own pair; a wrong one renders worse than
    // none, so the builder only claims a size it knows.
    if (image === OG_IMAGE) {
      expect([width, height]).toEqual(['1200', '630']);
    } else {
      expect([width, height]).toEqual([undefined, undefined]);
    }
  });

  it('escapes quotes and angle brackets in meta content', () => {
    const html = headFor({
      path: '/',
      title: 'A "quoted" <tag> & more',
      description: 'plain',
      ogType: 'website',
      jsonLd: [],
    });
    expect(html).toContain('<title>A &quot;quoted&quot; &lt;tag&gt; &amp; more</title>');
  });
});
