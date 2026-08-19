import { describe, it, expect } from 'vitest';
import { headFor } from '@/seo/head';
import { ROUTES, SITEMAP_ROUTES } from '@/seo/routes';
import { ORIGIN } from '@/seo/site';

/**
 * Guards the metadata that decides how every page is indexed. The head is a
 * pure string builder precisely so this can be asserted without a browser or
 * a build.
 */

const heads = ROUTES.map((route) => [route.path, headFor(route.meta), route] as const);

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
