#!/usr/bin/env node
/**
 * Turns the built SPA shells into a set of real, static, fully-readable pages.
 *
 * Runs after `vite build` (see the `build` script). For each route in
 * src/seo/routes.ts it renders the React tree to static markup, splices that
 * into the matching built shell along with the route's <head>, and writes the
 * result at the URL's own path. The output is a page whose complete text is
 * present with JavaScript disabled — which is the entire point: the guide is
 * the only substantial prose the product has, and as SPA state it was
 * invisible to search.
 *
 * Also emits dist/sitemap.xml, injects font preloads with the real build
 * hashes, strips the source PNGs the guide no longer serves, and asserts that
 * nothing still references the files that strip removed.
 *
 * Usage: node scripts/prerender.mjs   (or: npm run build)
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SSR_DIR = join(ROOT, 'dist-ssr');

const SEO_START = '<!--seo:start-->';
const SEO_END = '<!--seo:end-->';
const ROOT_DIV = '<div id="root"></div>';

/* ── 1. Build the SSR bundle ───────────────────────────────────────────────
 * A separate Vite SSR pass rather than a browser screenshot. Playwright would
 * need a Chromium download on every deploy and would capture whatever the
 * browser happened to do — GSAP inline styles, a data-theme from localStorage
 * — which is not something a build artifact should contain. */
function buildSsr() {
  console.log('Building SSR bundle…');
  execFileSync(
    'npx',
    ['vite', 'build', '--ssr', 'src/prerender/entry-server.tsx', '--outDir', 'dist-ssr', '--logLevel', 'warn'],
    { cwd: ROOT, stdio: 'inherit' },
  );
}

/* ── 2. Read the built shells ──────────────────────────────────────────────
 * These carry the hashed <script> and <link rel=stylesheet> tags Vite emitted,
 * so splicing into them keeps the asset wiring correct without parsing it. */
function readShells() {
  const main = join(DIST, 'index.html');
  const guide = join(DIST, 'guide.html');
  for (const file of [main, guide]) {
    if (!existsSync(file)) {
      throw new Error(`Missing built shell ${file}. Did \`vite build\` run first?`);
    }
  }
  return { main: readFileSync(main, 'utf8'), guide: readFileSync(guide, 'utf8') };
}

/* ── 3. Font preloads ──────────────────────────────────────────────────────
 * The @fontsource stylesheets are inlined into the CSS bundle, so the browser
 * cannot discover the woff2 files until that CSS has parsed — two round trips
 * before the first glyph. Preload only the two faces that render above the
 * fold; preloading all seven would compete with the CSS itself. */
const PRELOAD_FACES = ['dm-sans-latin-400-normal', 'jetbrains-mono-latin-700-normal'];

function fontPreloads() {
  const assets = join(DIST, 'assets');
  if (!existsSync(assets)) return '';
  const files = readdirSync(assets).filter((f) => f.endsWith('.woff2'));
  const links = [];
  for (const face of PRELOAD_FACES) {
    const match = files.find((f) => f.startsWith(face));
    if (!match) {
      console.warn(`  ! no built woff2 for ${face}; skipping its preload`);
      continue;
    }
    links.push(
      `<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/${match}" />`,
    );
  }
  return links.join('\n    ');
}

/* ── 4. Splice one page ────────────────────────────────────────────────── */
function compose(shell, head, body, preloads) {
  const start = shell.indexOf(SEO_START);
  const end = shell.indexOf(SEO_END);
  if (start === -1 || end === -1) {
    throw new Error(`Shell is missing its ${SEO_START} / ${SEO_END} markers`);
  }
  const withHead =
    shell.slice(0, start) +
    (preloads ? `${head}\n    ${preloads}` : head) +
    shell.slice(end + SEO_END.length);

  if (!withHead.includes(ROOT_DIV)) {
    throw new Error(`Shell is missing ${ROOT_DIV}`);
  }
  return withHead.replace(ROOT_DIV, `<div id="root">${body}</div>`);
}

/** '/guide/loop-station' → 'dist/guide/loop-station/index.html'. */
function outputPath(routePath) {
  if (routePath === '/') return join(DIST, 'index.html');
  if (routePath === '/404') return join(DIST, '404.html');
  return join(DIST, routePath.slice(1), 'index.html');
}

/* ── 5. Collision guard ────────────────────────────────────────────────────
 * public/guide/*.png is copied to dist/guide/, and the section pages write
 * dist/guide/<slug>/. They coexist happily, but a slug that matched a
 * screenshot's basename would have one clobber the other. Assert instead of
 * finding out in production. */
function assertNoAssetCollision(paths) {
  const guideDir = join(DIST, 'guide');
  if (!existsSync(guideDir)) return;
  const assets = new Set(
    readdirSync(guideDir).map((name) => name.replace(/\.[a-z0-9]+$/i, '')),
  );
  for (const routePath of paths) {
    if (!routePath.startsWith('/guide/')) continue;
    const slug = routePath.slice('/guide/'.length);
    if (assets.has(slug)) {
      throw new Error(
        `Guide slug "${slug}" collides with public/guide/${slug}.*; rename one of them.`,
      );
    }
  }
}

/* ── 6. Strip the PNGs ─────────────────────────────────────────────────────
 * src/guide/Shot.tsx serves only the AVIF/WebP derivatives. The PNGs stay in
 * the repo because README.md embeds them, but shipping ~13 MB of unused
 * originals would undo the whole image pass. */
function stripGuidePngs() {
  const guideDir = join(DIST, 'guide');
  if (!existsSync(guideDir)) return 0;
  let bytes = 0;
  for (const name of readdirSync(guideDir)) {
    if (!name.endsWith('.png')) continue;
    const file = join(guideDir, name);
    bytes += readFileSync(file).length;
    unlinkSync(file);
  }
  return bytes;
}

/* ── 7. Dead-asset guard ───────────────────────────────────────────────────
 * The strip above runs after every page has already been written, so a page is
 * free to reference a file that no longer exists — which is exactly how eight
 * section pages came to advertise an og:image that 404s. Nothing catches that
 * at runtime either: a broken social card just renders blank. So walk what
 * actually ships and assert every /guide/ asset reference resolves.        */
const ASSET_EXT = /\.(png|jpe?g|webp|avif|gif|svg|mp4|webm)$/i;

function textFilesIn(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) textFilesIn(full, found);
    else if (/\.(html|webmanifest|xml|json)$/.test(entry.name)) found.push(full);
  }
  return found;
}

function assertGuideRefsResolve() {
  const missing = new Map();
  for (const file of textFilesIn(DIST)) {
    const text = readFileSync(file, 'utf8');
    for (const [, ref] of text.matchAll(/\/guide\/([A-Za-z0-9._-]+)/g)) {
      if (!ASSET_EXT.test(ref) || existsSync(join(DIST, 'guide', ref))) continue;
      if (!missing.has(ref)) missing.set(ref, new Set());
      missing.get(ref).add(file.slice(DIST.length + 1));
    }
  }
  if (missing.size) {
    const lines = [...missing].map(
      ([ref, where]) => `  /guide/${ref}  ← ${[...where].sort().join(', ')}`,
    );
    throw new Error(`Referenced by the build but not in it:\n${lines.join('\n')}`);
  }
  return true;
}

async function main() {
  buildSsr();

  const entry = pathToFileURL(join(SSR_DIR, 'entry-server.js')).href;
  const { render, ROUTE_PATHS, sitemapXml, robotsTxt } = await import(entry);

  const shells = readShells();
  const preloads = fontPreloads();

  assertNoAssetCollision(ROUTE_PATHS);

  console.log(`\nPrerendering ${ROUTE_PATHS.length} pages…`);
  for (const routePath of ROUTE_PATHS) {
    const { head, body, shell } = render(routePath);
    const html = compose(shells[shell], head, body, preloads);
    const out = outputPath(routePath);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    const words = body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    console.log(`  ✓ ${routePath.padEnd(28)} ${String(words).padStart(5)} words`);
  }

  writeFileSync(join(DIST, 'sitemap.xml'), sitemapXml());
  console.log('  ✓ sitemap.xml');

  // Generated, not copied from public/: the Sitemap line has to name the same
  // origin the canonicals do, and a static file cannot know it.
  writeFileSync(join(DIST, 'robots.txt'), robotsTxt());
  console.log('  ✓ robots.txt');

  // guide.html was only ever a Rollup entry to get a hashed bundle; every real
  // page has now been written to its own path.
  rmSync(join(DIST, 'guide.html'), { force: true });
  rmSync(SSR_DIR, { recursive: true, force: true });

  const stripped = stripGuidePngs();
  if (stripped) {
    console.log(`  ✓ stripped ${(stripped / 1024 / 1024).toFixed(1)} MB of source PNGs from dist/guide`);
  }

  assertGuideRefsResolve();
  console.log('  ✓ every /guide asset reference resolves');

  console.log('\nDone.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
