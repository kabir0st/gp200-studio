import { Card } from '@/components/ui/Card';
import type { GuideShot } from './manifest';

/**
 * A guide screenshot, full-width within the content column.
 *
 * Two things here are load-bearing for the prerendered pages:
 *
 * 1. Both stage themes are always rendered, and CSS on `html[data-theme]`
 *    picks one (see the .shot-light/.shot-dark rules in src/index.css). The
 *    old version read the theme from a React context, which cannot work on a
 *    page that ships as static HTML with no React on it. A `display: none`
 *    image with `loading="lazy"` is never fetched, so the hidden variant is
 *    free — and the visible one is correct on the very first paint.
 *
 *    That "free" holds ONLY while the hidden twin stays lazy. `display: none`
 *    does not cancel an *eager* fetch, so passing `priority` to both twins —
 *    which this did — pulled two 2400-wide images at fetchpriority=high on
 *    every page with a priority shot, and painted one of them. The dark twin is
 *    therefore pinned to `priority={false}` below, whatever the caller asks for.
 *
 * 2. `width`/`height` are the *intrinsic* pixel size. Together with the
 *    `h-auto` class they give the browser the aspect ratio before the bytes
 *    arrive, which is what keeps cumulative layout shift at zero.
 *
 * Sources come from scripts/optimize-guide-shots.mjs: AVIF and WebP at 1200
 * and 2400 wide. The `src` fallback is the 1200 WebP, never the PNG — the
 * PNGs are stripped from the build.
 */

// The guide sidebar is w-60 (15rem) and only present from lg up.
const SIZES = '(min-width: 1024px) calc(100vw - 15rem), 100vw';

// scripts/optimize-guide-shots.mjs emits exactly these two widths for every
// shot, in both formats and both themes. There is no per-shot variation to
// branch on — an earlier version tried to, guarding on `width >= 2400` when
// every shot is 2400 wide, so the other arm was unreachable.
const WIDTHS = [1200, 2400];

function sources(stem: string, type: 'avif' | 'webp') {
  return WIDTHS.map((w) => `${stem}-${w}.${type} ${w}w`).join(', ');
}

function Themed({ shot, theme, priority }: { shot: GuideShot; theme: 'light' | 'dark'; priority: boolean }) {
  const base = shot.src.replace(/^\//, '').replace(/\.png$/, '');
  const stem = `${import.meta.env.BASE_URL}${base}${theme === 'dark' ? '-dark' : ''}`;
  const hidden = theme === 'dark';
  return (
    <picture className={hidden ? 'shot-dark' : 'shot-light'}>
      <source type="image/avif" srcSet={sources(stem, 'avif')} sizes={SIZES} />
      <source type="image/webp" srcSet={sources(stem, 'webp')} sizes={SIZES} />
      <img
        src={`${stem}-1200.webp`}
        // The dark twin is the same picture; announcing it twice would just
        // make the figure read as two images to a screen reader.
        alt={hidden ? '' : shot.alt}
        aria-hidden={hidden || undefined}
        width={shot.width}
        height={shot.height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className="w-full h-auto rounded border border-border-subtle"
      />
    </picture>
  );
}

/** `priority` marks a page's LCP candidate — the first shot on that page. */
export function Shot({ shot, priority = false }: { shot: GuideShot; priority?: boolean }) {
  return (
    <Card className="p-2 mt-5">
      <figure className="m-0">
        <Themed shot={shot} theme="light" priority={priority} />
        {/* Never priority: it is display:none, and an eager fetch would race
            the visible twin for the LCP slot. See note 1 in the file header. */}
        <Themed shot={shot} theme="dark" priority={false} />
        <figcaption className="font-mono-display text-caption text-text-muted tracking-wide mt-2 px-1">
          {shot.caption}
        </figcaption>
      </figure>
    </Card>
  );
}
