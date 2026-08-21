import { SHOT_H, SHOT_W } from '@/guide/manifest';

/**
 * A product screenshot on the landing page.
 *
 * Same source set as the guide's Shot (src/guide/Shot.tsx) — AVIF and WebP at
 * 1200 and 2400 wide, produced by scripts/optimize-guide-shots.mjs — but only
 * ever the dark twin. The guide ships both themes and lets the
 * `.shot-light` / `.shot-dark` rules in src/index.css choose off
 * `html[data-theme]`; this page is dark end to end whatever the editor is set
 * to, so the light twin would be wrong on it and rendering a hidden copy would
 * be markup nobody sees.
 *
 * The PNG originals are never referenced. scripts/prerender.mjs deletes
 * dist/guide/*.png after the pages are written and then asserts that no
 * shipped file still points at one, so a `.png` src here fails the build.
 */

interface LandingShotProps {
  /** Stem under public/guide/, e.g. `02-editor-board`. No suffix, no extension. */
  name: string;
  alt: string;
  /** Marks the LCP candidate: eager + high fetch priority. One per page. */
  priority?: boolean;
  /** Rendered width hint for srcset selection. */
  sizes?: string;
  className?: string;
}

const DEFAULT_SIZES = '(min-width: 1100px) 1040px, 100vw';

function srcSet(stem: string, type: 'avif' | 'webp') {
  return [1200, 2400].map((w) => `${stem}-${w}.${type} ${w}w`).join(', ');
}

export function LandingShot({
  name,
  alt,
  priority = false,
  sizes = DEFAULT_SIZES,
  className = 'lp-shot-img',
}: LandingShotProps) {
  const stem = `${import.meta.env.BASE_URL}guide/${name}-dark`;
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet(stem, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet(stem, 'webp')} sizes={sizes} />
      <img
        src={`${stem}-1200.webp`}
        alt={alt}
        // Intrinsic size, so the aspect ratio is known before the bytes land
        // and the reveal animations never fight a reflow.
        width={SHOT_W}
        height={SHOT_H}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={className}
      />
    </picture>
  );
}
