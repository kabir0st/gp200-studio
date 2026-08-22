import { describe, it, expect } from 'vitest';
import {
  GUIDE_BY_SLUG,
  GUIDE_SECTIONS,
  allGuideFaqs,
  guideNeighbours,
} from '@/guide/manifest';
import { SECTION_BODIES } from '@/guide/sections';

/**
 * The manifest is the single source of truth for fourteen public URLs, so the
 * things that would silently break search — a duplicate slug, a title that
 * gets truncated in results, a renamed anchor that strands old deep links —
 * are asserted here rather than discovered in Search Console.
 */

/** The in-page anchor ids the pre-split guide shipped with. Old `#anchor`
 *  links point at these, and the guide_read analytics dimension used them, so
 *  they must survive the restructure verbatim. */
const LEGACY_IDS = [
  'overview',
  'editor',
  'pedals',
  'deck',
  'drawers',
  'bulk',
  'looper',
  'drums',
  'remote',
  'patches',
  'connect',
  'files',
  'requirements',
];

describe('guide manifest', () => {
  it('has one entry per original guide section', () => {
    expect(GUIDE_SECTIONS).toHaveLength(13);
  });

  it('keeps the original anchor ids, in order', () => {
    expect(GUIDE_SECTIONS.map((s) => s.id)).toEqual(LEGACY_IDS);
  });

  it('has unique, URL-safe slugs', () => {
    const slugs = GUIDE_SECTIONS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('has a rendered body for every slug, and no orphan bodies', () => {
    expect(Object.keys(SECTION_BODIES).sort()).toEqual(
      GUIDE_SECTIONS.map((s) => s.slug).sort(),
    );
  });

  // Google truncates around 60 characters; longer titles lose their tail,
  // which is where the differentiating words live.
  it.each(GUIDE_SECTIONS.map((s) => [s.slug, s] as const))(
    '%s has a title that survives truncation',
    (_slug, section) => {
      expect(section.metaTitle.length).toBeLessThanOrEqual(60);
      expect(section.metaTitle.length).toBeGreaterThan(15);
    },
  );

  /**
   * One brand suffix, spelled the same way every time. Four were in use at
   * once — including a truncated "— GP200" on two sections, which reads as a
   * copy error in a result list — because nothing checked. A SERP shows these
   * side by side, so the inconsistency is visible exactly where it costs most.
   */
  it.each(GUIDE_SECTIONS.map((s) => [s.slug, s] as const))(
    '%s carries the one canonical brand suffix',
    (_slug, section) => {
      expect(section.metaTitle.endsWith(' \u2014 GP200 Studio')).toBe(true);
      // ...and says it once: a title whose own text ends in the brand would
      // otherwise read "GP200 Studio — GP200 Studio".
      const stem = section.metaTitle.slice(0, -' \u2014 GP200 Studio'.length);
      expect(stem).not.toMatch(/GP200 Studio$/);
      expect(stem.length).toBeGreaterThan(0);
    },
  );

  it.each(GUIDE_SECTIONS.map((s) => [s.slug, s] as const))(
    '%s has a well-sized meta description',
    (_slug, section) => {
      expect(section.metaDescription.length).toBeGreaterThanOrEqual(110);
      expect(section.metaDescription.length).toBeLessThanOrEqual(165);
    },
  );

  it.each(GUIDE_SECTIONS.map((s) => [s.slug, s] as const))(
    '%s has a valid ISO lastmod',
    (_slug, section) => {
      expect(section.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(section.lastmod))).toBe(false);
    },
  );

  it('resolves every slug through the lookup map', () => {
    expect(GUIDE_BY_SLUG.size).toBe(GUIDE_SECTIONS.length);
    for (const section of GUIDE_SECTIONS) {
      expect(GUIDE_BY_SLUG.get(section.slug)).toBe(section);
    }
  });

  it('chains prev/next across the whole run', () => {
    const first = GUIDE_SECTIONS[0];
    const last = GUIDE_SECTIONS[GUIDE_SECTIONS.length - 1];
    expect(guideNeighbours(first.slug).prev).toBeNull();
    expect(guideNeighbours(last.slug).next).toBeNull();
    expect(guideNeighbours(GUIDE_SECTIONS[1].slug).prev).toBe(first);
    expect(guideNeighbours('not-a-slug')).toEqual({ prev: null, next: null });
  });

  it('collects non-empty, non-duplicated FAQs for the hub', () => {
    const faqs = allGuideFaqs();
    expect(faqs.length).toBeGreaterThanOrEqual(8);
    expect(new Set(faqs.map((f) => f.q)).size).toBe(faqs.length);
    for (const faq of faqs) {
      expect(faq.q.endsWith('?')).toBe(true);
      expect(faq.a.length).toBeGreaterThan(40);
    }
  });
});
