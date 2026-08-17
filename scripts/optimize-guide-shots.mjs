#!/usr/bin/env node
/**
 * Derives modern, right-sized variants of the guide screenshots.
 *
 * For every public/guide/*.png (light and dark), emits AVIF and WebP at 1200
 * and 2400 wide. src/guide/Shot.tsx serves those through a <picture>, so the
 * browser fetches roughly a tenth of the bytes the PNGs cost.
 *
 * The PNGs stay in the repo because README.md embeds several of them and
 * GitHub's AVIF support is patchy — but scripts/prerender.mjs deletes them
 * from dist/, so they are never served to a visitor.
 *
 * Run automatically at the end of scripts/capture-guide-shots.mjs, so a
 * re-capture can't leave stale derivatives behind.
 *
 * Usage: node scripts/optimize-guide-shots.mjs   (or: npm run gen:shots)
 */
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'public', 'guide');

// The guide's content column tops out around 1400 CSS px, so 1200 covers
// ordinary displays and 2400 covers 2x. Anything narrower than a target width
// is skipped rather than upscaled (see withoutEnlargement).
const WIDTHS = [1200, 2400];

// AVIF at q50 is visually lossless for flat UI screenshots and roughly half
// the size of the equivalent WebP; WebP is the fallback for older Safari.
const AVIF = { quality: 50, effort: 6 };
const WEBP = { quality: 78 };

async function main() {
  const sources = readdirSync(DIR).filter((f) => f.endsWith('.png'));
  if (sources.length === 0) {
    console.error(`No PNGs in ${DIR}. Run scripts/capture-guide-shots.mjs first.`);
    process.exit(1);
  }

  let before = 0;
  let after = 0;

  for (const file of sources) {
    const src = join(DIR, file);
    const stem = file.replace(/\.png$/, '');
    before += statSync(src).size;

    const { width } = await sharp(src).metadata();

    for (const target of WIDTHS) {
      // A 2400x98 strip has no meaningful 1200 variant beyond the 2400 one;
      // withoutEnlargement makes the resize a no-op, so skip the duplicate.
      if (target > width) continue;
      const base = join(DIR, `${stem}-${target}`);
      const resized = () => sharp(src).resize({ width: target, withoutEnlargement: true });
      await resized().avif(AVIF).toFile(`${base}.avif`);
      await resized().webp(WEBP).toFile(`${base}.webp`);
      after += statSync(`${base}.avif`).size + statSync(`${base}.webp`).size;
    }
    console.log(`  ✓ ${stem}`);
  }

  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  console.log(`\nPNG sources ${mb(before)} → derivatives ${mb(after)} (AVIF + WebP, 2 widths)`);
}

main();
