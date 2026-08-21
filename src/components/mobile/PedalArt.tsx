import type { CSSProperties } from 'react';
import { artBox, pedalArtUrl, type PedalArtEntry } from '@/components/board/pedalManifest';

interface PedalArtProps {
  art: PedalArtEntry;
  /**
   * 'crop' shows the subject alone — for thumbnails, where empty canvas is
   * space the pedal could have used. 'full' shows the whole 160×64 canvas,
   * including the ground shadow the pedal stands on and, on acoustic bodies,
   * the name set off to one side; that framing is the point of the hero.
   */
  fit?: 'crop' | 'full';
  className?: string;
}

/** The whole canvas, as the generator draws it (scripts/generate-pedal-art.mjs). */
const CANVAS_W = 160;

/**
 * A pedal, amp or cab from public/pedals/, shown at a size where you can see it.
 *
 * The component's whole job is to hand CSS the artwork's content box as two
 * custom properties; `.m-art` in pedals.css does the rest. Keeping the crop in
 * CSS is what lets it stay a plain `<img>` — the service worker's cache entry,
 * the browser's own cache and `loading="lazy"` all survive, and none of them
 * would if the markup were inlined — and it keeps the sizing in one place, so a
 * media query can resize a thumbnail without a matching edit over here.
 */
export function PedalArt({ art, fit = 'crop', className }: PedalArtProps) {
  const box = fit === 'full' ? { x: 0, w: CANVAS_W } : artBox(art);
  const vars = { '--art-x': String(box.x), '--art-w': String(box.w) } as CSSProperties;

  return (
    <span className={className ? `m-art ${className}` : 'm-art'} style={vars}>
      {/* decorative: every caller names the effect in adjacent text */}
      <img src={pedalArtUrl(art)} alt="" loading="lazy" draggable={false} />
    </span>
  );
}
