import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { artBox, type PedalArtEntry } from '@/components/board/pedalManifest';

const manifest: PedalArtEntry[] = JSON.parse(
  readFileSync('public/pedals/manifest.json', 'utf8'),
);

/** A manifest entry with its `art` field stripped, as a pre-`art` build wrote it. */
function stale(entry: PedalArtEntry): PedalArtEntry {
  const { art: _art, ...rest } = entry;
  return rest;
}

function bySlug(slug: string): PedalArtEntry {
  const entry = manifest.find((e) => e.slug === slug);
  if (!entry) throw new Error(`no manifest entry for ${slug}`);
  return entry;
}

describe('artBox', () => {
  it('returns the generated content box when the manifest carries one', () => {
    // od-9 is a stompbox: a 42-wide body centred on the 160-wide canvas, plus
    // its two 3.4-wide side jacks
    expect(artBox(bySlug('od-9'))).toEqual({ x: 55.6, w: 48.8 });
    // an amp head fills the canvas
    expect(artBox(bySlug('uk-800'))).toEqual({ x: 6, w: 148 });
  });

  it('gives every generated entry a box inside the canvas', () => {
    for (const entry of manifest) {
      const box = artBox(entry);
      expect(box.w).toBeGreaterThan(0);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(160);
    }
  });

  it('falls back to a centred box when the entry predates the art field', () => {
    // public/sw.js serves manifest.json stale-while-revalidate, so a returning
    // visitor gets the previous manifest for one load after a deploy
    const box = artBox(stale(bySlug('od-9')));
    expect(box.w).toBe(64.8);
    expect(box.x).toBeCloseTo((160 - 64.8) / 2, 5);
  });

  it('never clips a subject when falling back', () => {
    // Erring wide is the safe direction: an over-wide fallback shows a little
    // empty margin, an over-narrow one cuts the pedal in half. Assert that for
    // every entry, not just the ones the table happens to name.
    for (const entry of manifest) {
      const real = artBox(entry);
      const guess = artBox(stale(entry));
      expect(guess.w).toBeGreaterThanOrEqual(real.w);
      expect(guess.x).toBeLessThanOrEqual(real.x);
      expect(guess.x + guess.w).toBeGreaterThanOrEqual(real.x + real.w);
    }
  });
});
