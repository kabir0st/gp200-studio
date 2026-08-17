#!/usr/bin/env node
/**
 * Social-card + icon generator.
 *
 * Emits, into public/:
 *   og-image.png            1200×630 branded Open Graph card   (opaque)
 *   apple-touch-icon.png    180×180 iOS home-screen            (opaque, full-bleed)
 *   icon-maskable-512.png   512×512 Android adaptive icon      (opaque, 56% safe zone)
 *   favicon-32.png          32×32   PNG fallback for the SVG   (transparent corners)
 *   favicon-16.png          16×16                              (transparent corners)
 *   icon-192.png            192×192 PWA manifest               (transparent corners)
 *   icon-512.png            512×512 PWA manifest               (transparent corners)
 *
 * On the transparent/opaque split — this is deliberate, do not "unify" it:
 *   • The plain icons keep favicon.svg's rx=7 rounding, so their corners MUST be
 *     alpha. Screenshotting them over Chromium's default white page (which is
 *     what `omitBackground: false` does) frames the mark in white notches that
 *     show up on dark tab strips and dark launchers. Hence omitBackground
 *     defaults to true in shoot().
 *   • apple-touch-icon must be opaque (iOS composites alpha onto black) and
 *     square (iOS applies its own squircle), so it drops the rx entirely.
 *   • The maskable icon must be opaque and leave a sacrificial margin, since
 *     Android crops it to an arbitrary shape.
 *
 * The OG card is original vector/HTML art evoking the GP-200 floor unit (colors,
 * LCD, footswitches), with no Valeton logos or trademarks, matching the rule in
 * scripts/generate-pedal-art.mjs. Brand fonts (JetBrains Mono, DM Sans) are
 * embedded as base64 @font-face so the render is self-contained and doesn't
 * depend on Chromium's system fonts.
 *
 * Rasterization uses Playwright's headless Chromium (already a devDependency).
 * The PNGs are committed to public/, so this only needs re-running when the
 * brand art changes.
 *
 * Usage: node scripts/generate-og-image.mjs   (or: npm run gen:og)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');

/* ── brand tokens (mirrors public/favicon.svg + docs/design-system.md) ────── */
const INK = '#232220'; // enclosure body / theme-color
const DEEP = '#14110d'; // deep background
const LCD = '#5df08a'; // LCD green accent
const LED = '#d9a13c'; // amber LED accent
const MONO = 'JetBrains Mono';
const SANS = 'DM Sans';

/* ── embed brand fonts as base64 data URIs so the render is deterministic ── */
function font(pkg, file) {
  const p = join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file);
  const b64 = readFileSync(p).toString('base64');
  return `data:font/woff2;base64,${b64}`;
}
const FONTS = `
  @font-face { font-family: 'JetBrains Mono'; font-weight: 400;
    src: url('${font('jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff2')}') format('woff2'); }
  @font-face { font-family: 'JetBrains Mono'; font-weight: 700;
    src: url('${font('jetbrains-mono', 'jetbrains-mono-latin-700-normal.woff2')}') format('woff2'); }
  @font-face { font-family: 'DM Sans'; font-weight: 400;
    src: url('${font('dm-sans', 'dm-sans-latin-400-normal.woff2')}') format('woff2'); }
  @font-face { font-family: 'DM Sans'; font-weight: 600;
    src: url('${font('dm-sans', 'dm-sans-latin-600-normal.woff2')}') format('woff2'); }
`;

/* ── the GP-200 mark, scaled up from public/favicon.svg (original art) ────── */
const MARK = `
<svg width="200" height="200" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="32" height="32" rx="7" fill="#2b2926"/>
  <rect width="32" height="32" rx="7" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="1"/>
  <rect x="6" y="7" width="13" height="7" rx="1.5" fill="#0c1a0e"/>
  <rect x="8" y="9.5" width="9" height="2" rx="1" fill="${LCD}"/>
  <circle cx="24.5" cy="10.5" r="3.2" fill="#8a857c"/>
  <rect x="24" y="7.6" width="1" height="3" rx="0.5" fill="#232220"/>
  <circle cx="24.5" cy="18.5" r="1.4" fill="${LED}"/>
  <circle cx="9" cy="24" r="3" fill="none" stroke="#b0aca3" stroke-width="1.6"/>
  <circle cx="19" cy="24" r="3" fill="none" stroke="#b0aca3" stroke-width="1.6"/>
</svg>`;

const CHIPS = ['.prst editor', 'USB-MIDI', '305 effects', 'no install'];

/* ── 1200×630 Open Graph card as a self-contained HTML doc ────────────────── */
function ogHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${FONTS}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  .card {
    width: 1200px; height: 630px; position: relative; overflow: hidden;
    background:
      radial-gradient(1100px 700px at 78% -10%, rgba(93,240,138,.14), transparent 60%),
      radial-gradient(900px 600px at 12% 120%, rgba(217,161,60,.12), transparent 55%),
      linear-gradient(155deg, ${INK} 0%, ${DEEP} 100%);
    color: #f4f1ea; font-family: '${SANS}', system-ui, sans-serif;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 72px 80px;
  }
  /* faint horizon grid */
  .grid { position: absolute; inset: 0; opacity: .06;
    background-image: linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px);
    background-size: 60px 60px; mask-image: linear-gradient(180deg, transparent, #000 40%, #000 70%, transparent); }
  .top { display: flex; align-items: center; gap: 28px; position: relative; }
  .wordmark { font-family: '${MONO}', monospace; font-weight: 700; font-size: 84px; letter-spacing: -2px; line-height: 1; }
  .wordmark .accent { color: ${LCD}; }
  .kicker { font-family: '${MONO}', monospace; font-weight: 700; font-size: 20px; letter-spacing: 6px;
    text-transform: uppercase; color: ${LED}; margin-bottom: 22px; }
  .mid { position: relative; }
  .tagline { font-size: 46px; font-weight: 600; line-height: 1.15; max-width: 940px; letter-spacing: -.5px; }
  .tagline .em { color: ${LCD}; }
  .sub { font-size: 25px; color: #b7b1a5; margin-top: 20px; max-width: 900px; line-height: 1.4; }
  .bottom { display: flex; align-items: center; justify-content: space-between; position: relative; }
  .chips { display: flex; gap: 14px; flex-wrap: wrap; }
  .chip { font-family: '${MONO}', monospace; font-size: 20px; font-weight: 400; color: #e7e2d8;
    border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.04);
    border-radius: 999px; padding: 11px 20px; }
  .url { font-family: '${MONO}', monospace; font-size: 24px; color: ${LCD}; font-weight: 700; letter-spacing: .5px; }
  </style></head><body>
  <div class="card">
    <div class="grid"></div>
    <div>
      <div class="kicker">Valeton GP-200 · browser editor</div>
      <div class="top">
        ${MARK}
        <div class="wordmark">GP200 <span class="accent">Studio</span></div>
      </div>
    </div>
    <div class="mid">
      <div class="tagline">Edit &amp; push <span class="em">GP-200</span> presets<br>live from your browser.</div>
      <div class="sub">Load, tweak and export <b>.prst</b> preset files and send changes to the pedal over USB-MIDI. No install, no account, no backend.</div>
    </div>
    <div class="bottom">
      <div class="chips">${CHIPS.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
      <div class="url">gp200studio.com</div>
    </div>
  </div>
  </body></html>`;
}

/* ── icon page: the favicon mark filling an N×N square ────────────────────── */
// Rendered with omitBackground, so everything outside the mark's rx=7 corners
// stays transparent instead of picking up Chromium's white page.
function iconHtml(size) {
  const svg = readFileSync(join(OUT, 'favicon.svg'), 'utf8');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  html, body { width: ${size}px; height: ${size}px; background: transparent; }
  svg { width: ${size}px; height: ${size}px; display: block; }
  </style></head><body>${svg}</body></html>`;
}

/* ── iOS home-screen icon: opaque and full-bleed ───────────────────────────
 * iOS composites any alpha onto black and then applies its own squircle mask,
 * so a pre-rounded transparent icon reads as a dark blob with black slivers in
 * the corners. Drop the enclosure's rx and paint the page the same ink, so the
 * art runs edge to edge and Apple's mask has solid pixels to cut.            */
function appleIconHtml(size) {
  const svg = readFileSync(join(OUT, 'favicon.svg'), 'utf8').replace(
    '<rect width="32" height="32" rx="7"',
    '<rect width="32" height="32" rx="0"',
  );
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  html, body { width: ${size}px; height: ${size}px; background: ${INK}; }
  svg { width: ${size}px; height: ${size}px; display: block; }
  </style></head><body>${svg}</body></html>`;
}

/* ── Android/PWA maskable icon: opaque, with a safe zone ───────────────────
 * A maskable icon is cropped to whatever shape the launcher wants, and only
 * the centre circle of 80% diameter is guaranteed to survive. The largest
 * square that fits inside that circle has side 0.8·S/√2 ≈ 0.566·S, so the mark
 * is drawn at 56% and centred; the outer ~22% per edge is sacrificial. DEEP
 * (rather than INK) is the field so the enclosure still reads as an object.  */
function maskableIconHtml(size) {
  const svg = readFileSync(join(OUT, 'favicon.svg'), 'utf8');
  const inner = Math.round(size * 0.56);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  html, body { width: ${size}px; height: ${size}px; background: ${DEEP}; }
  body { display: flex; align-items: center; justify-content: center; }
  svg { width: ${inner}px; height: ${inner}px; display: block; }
  </style></head><body>${svg}</body></html>`;
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright not found. Run: npm install (then `npx playwright install chromium` if the browser is missing).');
    process.exit(1);
  }

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    console.error('Could not launch Chromium. Run: npx playwright install chromium');
    console.error(String(err.message || err));
    process.exit(1);
  }

  // Transparency is the right default for an icon; the three opaque outputs
  // (the OG card, the iOS icon and the maskable icon) opt out explicitly.
  const shoot = async (html, width, height, outfile, { omitBackground = true } = {}) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const buf = await page.screenshot({ clip: { x: 0, y: 0, width, height }, omitBackground });
    writeFileSync(join(OUT, outfile), buf);
    await page.close();
    console.log(`  ✓ public/${outfile}  (${width}×${height})`);
  };

  console.log('Generating social card + icons…');
  // Opaque by design (see the header note on the transparent/opaque split).
  await shoot(ogHtml(), 1200, 630, 'og-image.png', { omitBackground: false });
  await shoot(appleIconHtml(180), 180, 180, 'apple-touch-icon.png', { omitBackground: false });
  await shoot(maskableIconHtml(512), 512, 512, 'icon-maskable-512.png', { omitBackground: false });
  // Transparent corners.
  await shoot(iconHtml(32), 32, 32, 'favicon-32.png');
  await shoot(iconHtml(16), 16, 16, 'favicon-16.png');
  await shoot(iconHtml(192), 192, 192, 'icon-192.png');
  await shoot(iconHtml(512), 512, 512, 'icon-512.png');

  await browser.close();
  console.log('Done.');
}

main();
