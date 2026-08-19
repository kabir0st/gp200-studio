import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { GUIDE_SECTIONS } from '@/guide/manifest';
import { GuideSectionPage } from '@/guide/GuideSection';
import { GuideHub } from '@/guide/GuideHub';

/**
 * Renders every guide page and asserts the things a search engine and a
 * screen reader both care about: a single h1, described images, and — the
 * reason this file exists — intrinsic width/height on every <img>. Without
 * those, each screenshot reflows the page as it loads, and Cumulative Layout
 * Shift is a ranking signal.
 */

const cases = GUIDE_SECTIONS.map((section) => [section.slug, section] as const);

describe('guide section pages', () => {
  it.each(cases)('%s renders a single h1 matching the manifest', (slug, section) => {
    const { container } = render(<GuideSectionPage slug={slug} />);
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe(section.title);
    // The pre-split anchor id rides on the h1 so old #deep links still land.
    expect(h1s[0].id).toBe(section.id);
    cleanup();
  });

  it.each(cases)('%s gives every image dimensions and a description', (slug) => {
    const { container } = render(<GuideSectionPage slug={slug} />);
    for (const img of container.querySelectorAll('img')) {
      expect(img.getAttribute('width')).toMatch(/^\d+$/);
      expect(img.getAttribute('height')).toMatch(/^\d+$/);
      // A shot is announced once: the light copy carries the alt text, the
      // dark duplicate is hidden from the accessibility tree.
      const alt = img.getAttribute('alt');
      expect(alt).not.toBeNull();
      if (alt === '') expect(img.getAttribute('aria-hidden')).toBe('true');
      else expect(alt!.length).toBeGreaterThan(10);
    }
    cleanup();
  });

  it.each(cases)('%s serves modern formats, never the stripped PNGs', (slug) => {
    const { container } = render(<GuideSectionPage slug={slug} />);
    for (const source of container.querySelectorAll('source')) {
      expect(source.getAttribute('type')).toMatch(/^image\/(avif|webp)$/);
      expect(source.getAttribute('srcset')).toMatch(/\d+w/);
    }
    for (const img of container.querySelectorAll('img')) {
      // dist/guide/*.png is deleted at build time, so a PNG reference here
      // would be a 404 in production.
      expect(img.getAttribute('src')).not.toMatch(/\.png$/);
    }
    cleanup();
  });

  it.each(cases)('%s links back to the hub and the app', (slug) => {
    const { container } = render(<GuideSectionPage slug={slug} />);
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/guide');
    expect(hrefs).toContain('/');
    cleanup();
  });

  it('renders a hub that links to all thirteen sections', () => {
    const { container } = render(<GuideHub />);
    const hrefs = new Set([...container.querySelectorAll('a')].map((a) => a.getAttribute('href')));
    for (const section of GUIDE_SECTIONS) {
      expect(hrefs.has(`/guide/${section.slug}`)).toBe(true);
    }
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('renders each hub FAQ answer visibly, as the FAQPage markup claims', () => {
    const { container } = render(<GuideHub />);
    const answers = [...container.querySelectorAll('dd')].map((dd) => dd.textContent ?? '');
    expect(answers.length).toBeGreaterThanOrEqual(8);
    for (const answer of answers) expect(answer.trim().length).toBeGreaterThan(40);
  });

  it('throws rather than rendering an unknown slug', () => {
    expect(() => render(<GuideSectionPage slug="nope" />)).toThrow(/Unknown guide section/);
  });
});
