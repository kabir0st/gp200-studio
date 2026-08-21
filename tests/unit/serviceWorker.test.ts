import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the parts of public/sw.js that rot silently.
 *
 * Everything this file checks was, at some point, wrong in a way that looked
 * perfectly fine online and only showed up at the venue: file types the cache
 * skipped (avif — every screenshot, and the first <picture> source, so it
 * breaks rather than downgrades — flac for the ACOUSTIC kit, json for the pedal
 * manifest), a first visit that cached nothing because the requests that boot
 * the app happen before the worker exists, and cache lookups that matched on
 * `Vary` and so never returned the entries the worker had just stored.
 *
 * sw.js is a worker script, not a module: it calls self.addEventListener at top
 * level and cannot be imported. So it is evaluated here against a stub `self`,
 * which runs the top-level code and hands back the pure helpers. The event
 * handlers are registered against the stub and never fire, which is why the
 * policy rules below are asserted against the source text instead.
 */

const ROOT = join(__dirname, '../..');
const SW_PATH = join(ROOT, 'public/sw.js');
const SW = readFileSync(SW_PATH, 'utf8');
const ORIGIN = 'https://gp200studio.com';

function loadWorker() {
  const self = {
    addEventListener: () => {},
    registration: { scope: `${ORIGIN}/` },
    location: new URL(`${ORIGIN}/sw.js`),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const evaluate = new Function(
    'self',
    `${SW}\n;return { isStaticAsset, isImmutableAsset, bootAssets, SHELL };`,
  ) as (s: unknown) => {
    isStaticAsset: (url: URL) => boolean;
    isImmutableAsset: (url: URL) => boolean;
    bootAssets: (html: string, base: string) => string[];
    SHELL: string;
  };
  return evaluate(self);
}

/** Never fetched by the app: docs, the crawler file, and the worker itself. */
const NOT_APP_ASSETS = new Set(['md', 'txt', 'js']);

function extensionsIn(dir: string, found = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      extensionsIn(path, found);
      continue;
    }
    const ext = entry.name.split('.').pop();
    if (ext && ext !== entry.name) found.add(ext.toLowerCase());
  }
  return found;
}

describe('offline service worker', () => {
  const { isStaticAsset, isImmutableAsset, bootAssets, SHELL } = loadWorker();
  const at = (path: string) => new URL(path, ORIGIN);

  it('caches every file type the app serves from public/', () => {
    const missing = [...extensionsIn(join(ROOT, 'public'))]
      .filter((ext) => !NOT_APP_ASSETS.has(ext))
      .filter((ext) => !isStaticAsset(at(`/x.${ext}`)))
      .sort();
    expect(missing, 'add these to isStaticAsset in public/sw.js').toEqual([]);
  });

  it.each([
    ['/guide/01-landing-1200.avif', 'guide screenshot'],
    ['/guide/01-landing-1200.webp', 'guide screenshot fallback'],
    ['/drums/acoustic/kick.flac', 'ACOUSTIC drum kit'],
    ['/drums/tr808/kick.wav', 'sampled drum kit'],
    ['/pedals/manifest.json', 'pedal art manifest'],
    ['/ui/switch-on.wav', 'UI click'],
    ['/favicon.svg', 'favicon'],
    ['/site.webmanifest', 'install manifest'],
  ])('caches %s (%s)', (path) => {
    expect(existsSync(join(ROOT, 'public', path.slice(1))), `${path} is a real file`).toBe(true);
    expect(isStaticAsset(at(path))).toBe(true);
  });

  it('leaves the documents and the worker itself alone', () => {
    for (const path of ['/robots.txt', '/drums/README.md', '/sw.js']) {
      expect(isStaticAsset(at(path)), path).toBe(false);
    }
  });

  it('treats the hashed bundle as immutable', () => {
    expect(isImmutableAsset(at('/assets/main-CrG8vTtr.js'))).toBe(true);
    expect(isImmutableAsset(at('/pedals/manifest.json'))).toBe(false);
  });

  describe('boot warming', () => {
    // What Vite emits, attribute order and all.
    const SHELL_HTML = `<!doctype html><html><head>
      <link rel="canonical" href="${ORIGIN}/" />
      <link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/dm-sans-400.woff2" />
      <script type="module" crossorigin src="/assets/main-abc.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/analytics-def.js">
      <link rel="stylesheet" crossorigin href="/assets/main-ghi.css">
      <link rel="icon" href="/favicon.svg" />
      <script>(function(){document.documentElement.dataset.theme='dark'})()</script>
      </head><body><div id="root"></div></body></html>`;

    it('finds the files a document boots from, and nothing else', () => {
      expect(bootAssets(SHELL_HTML, `${ORIGIN}/`).sort()).toEqual([
        `${ORIGIN}/assets/analytics-def.js`,
        `${ORIGIN}/assets/dm-sans-400.woff2`,
        `${ORIGIN}/assets/main-abc.js`,
        `${ORIGIN}/assets/main-ghi.css`,
      ]);
    });

    it('ignores cross-origin and inline scripts', () => {
      const urls = bootAssets(
        `<script src="https://www.googletagmanager.com/gtag/js"></script>${SHELL_HTML}`,
        `${ORIGIN}/`,
      );
      expect(urls.some((u) => !u.startsWith(ORIGIN))).toBe(false);
    });

    it('reads the real built shell, when there is one', () => {
      const built = join(ROOT, 'dist/index.html');
      if (!existsSync(built)) return; // no build in this checkout; the fixture above still ran
      const urls = bootAssets(readFileSync(built, 'utf8'), `${ORIGIN}/`);
      expect(urls.filter((u) => u.endsWith('.js')).length).toBeGreaterThan(0);
      expect(urls.filter((u) => u.endsWith('.css')).length).toBeGreaterThan(0);
    });

    it('warms the shell at install, from the registration scope', () => {
      expect(SHELL).toBe(`${ORIGIN}/`);
      const install = SW.slice(SW.indexOf("addEventListener('install'"), SW.indexOf("addEventListener('activate'"));
      expect(install).toContain('put(new Request(SHELL)');
      expect(install).toContain('bootAssets(');
    });
  });

  it('never lets Vary decide a lookup', () => {
    // A response with `Vary: Origin` (dev/preview) or `Vary: Accept-Encoding`
    // (most CDNs) is matched against the headers of the request that stored it,
    // so a worker-warmed file never matches the page's own request for it.
    const lookups = SW.match(/caches\.match\([^)]*\)/g) ?? [];
    expect(lookups.length).toBeGreaterThan(0);
    for (const lookup of lookups) expect(lookup, lookup).toContain('MATCH');
    expect(SW).toContain('ignoreVary: true');
  });

  it('keeps the rules that make a bad cache impossible to get stuck in', () => {
    expect(SW).toMatch(/request\.mode === 'navigate'[\s\S]*?networkFirst\(request\)/);
    expect(SW).toMatch(/request\.method !== 'GET'/);
    expect(SW).toMatch(/headers\.has\('range'\)/);

    const register = readFileSync(join(ROOT, 'src/core/registerServiceWorker.ts'), 'utf8');
    expect(register).toContain("has('nosw')");
    expect(register).toContain('unregister()');
  });
});
