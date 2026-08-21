/**
 * Offline service worker for GP200 Studio.
 *
 * The point is the venue, not the desk: you open the app at home, then load in
 * somewhere with no usable wifi and still need the editor, the looper and the
 * drum machine. Nothing here talks to a server — the pedal is on USB — so the
 * only thing standing between the app and offline use is fetching its own
 * files.
 *
 * Deliberately runtime-cached rather than precached from a build manifest:
 * there is no generated asset list to drift out of sync with the bundle, and a
 * cold visit costs exactly what it did before. Everything the first visit
 * touches is available on the next one, online or not.
 *
 * The single exception is the shell and the scripts it boots from, warmed at
 * install (see below) and discovered by reading the shell's own HTML, not a
 * generated list. Without it a visitor who lands once and closes the tab has
 * nothing cached at all: every one of those requests happened before this
 * worker existed, so none of them was intercepted.
 *
 * Safety rules, in rough order of how badly getting them wrong would hurt:
 *   - Navigations are network-first, so a deploy always wins and the app can
 *     never pin itself to a stale build.
 *   - Only same-origin GETs are touched. Analytics and any other cross-origin
 *     request passes straight through and is never stored.
 *   - Range requests (audio seeking) bypass the cache: a 206 stored as a whole
 *     response would corrupt playback.
 *   - Any failure falls through to the network. A broken cache degrades to
 *     "normal website", never to a broken one.
 */

const VERSION = 'v1';
const CACHE = `gp200-studio-${VERSION}`;

/**
 * The app shell: the scope root, which is whatever BASE_URL the worker shipped
 * under. Taken from the registration rather than hard-coded to '/' so a build
 * served from a subfolder keeps working.
 */
const SHELL = self.registration.scope;

/** Hashed build output: content-addressed, so it can be trusted forever. */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/assets/');
}

/**
 * Static files served under their own names (art, drum kits, icons, sounds).
 *
 * Every extension the app can request belongs here, and the list is the easy
 * thing to under-fill: an omission is invisible online and only shows up at the
 * venue, as a missing kit or a broken screenshot. What is in play —
 *
 *   avif, webp, png, jpg  guide and landing screenshots. avif is the first
 *                         <picture> source, and a <picture> whose chosen source
 *                         fails does NOT fall back to the next one, so leaving
 *                         it out breaks the image rather than downgrading it.
 *   svg                   pedal art
 *   wav, flac             drum kits (ACOUSTIC is flac) and the UI clicks
 *   json                  pedals/manifest.json, fetched at runtime for the art
 *   woff2, ico, webmanifest   the self-hosted faces, favicons, install manifest
 *
 * tests/unit/serviceWorker.test.ts fails if a file type lands in public/ that
 * this does not cover.
 */
function isStaticAsset(url) {
  return /\.(avif|webp|png|jpe?g|svg|ico|woff2?|wav|flac|mp3|ogg|json|webmanifest)$/i.test(
    url.pathname,
  );
}

/**
 * The URLs a document names for its own boot: entry script, modulepreloads,
 * stylesheets, and the two font faces prerender.mjs preloads.
 *
 * Parsed out of the HTML rather than read from a build manifest. The shell just
 * fetched already names its bundle, so this cannot drift from the deploy that
 * served it — which was the whole reason for not precaching from a manifest.
 * No DOMParser in a worker, hence the tag scan; attribute order is not assumed.
 */
function bootAssets(html, base) {
  const urls = new Set();
  const add = (href) => {
    if (!href) return;
    const url = new URL(href, base);
    if (url.origin === self.location.origin) urls.add(url.href);
  };
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    add(tag.match(/\bsrc="([^"]+)"/i)?.[1]);
  }
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel="(?:stylesheet|modulepreload|preload)"/i.test(tag)) continue;
    add(tag.match(/\bhref="([^"]+)"/i)?.[1]);
  }
  return [...urls];
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Warm the shell and the files it boots from. Everything else arrives in
    // the cache by being used, but these cannot: they were requested before
    // this worker existed, so nothing intercepted them. Without this, someone
    // who opens the app once, works in it (the editor is a pushState away, not
    // a second navigation) and closes the tab gets the browser's offline page
    // at the venue — or, worse, the prerendered landing page with no bundle
    // behind it, which paints perfectly and does nothing when clicked.
    //
    // The cost is small: the browser fetched all of this moments ago, so these
    // come back from its own HTTP cache, and /assets/* is immutable.
    try {
      const response = await fetch(SHELL);
      await put(new Request(SHELL), response); // put() stores a clone
      const html = await response.text();
      await Promise.all(
        bootAssets(html, SHELL).map(async (url) => {
          try {
            await put(new Request(url), await fetch(url));
          } catch {
            /* one missing file must not fail the install */
          }
        }),
      );
    } catch {
      /* installed while offline: the next online navigation warms the shell */
    }
    // Take over as soon as the worker is ready; combined with the network-first
    // navigation rule this keeps deploys landing promptly.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => (name === CACHE ? null : caches.delete(name))));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});

/**
 * Every lookup ignores Vary.
 *
 * Nothing here is content-negotiated — same-origin GETs of static files — but
 * the responses still carry `Vary` (`Origin` from the dev/preview server,
 * `Accept-Encoding` from most CDNs). Vary matching then compares the headers of
 * the request that *stored* the entry against the one asking for it, so a file
 * warmed by the worker (no Origin header) never matches the page's own request
 * for it (`<script crossorigin>` sends one). The entry sits in the cache and is
 * never returned: online you notice nothing, offline the bundle 404s into a
 * dead page.
 */
const MATCH = { ignoreVary: true };

/** Cache a response only when it is a complete, cacheable same-origin hit. */
async function put(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return response;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    return await put(request, await fetch(request));
  } catch (err) {
    const cached = await caches.match(request, MATCH);
    if (cached) return cached;
    // A deep guide URL that was never visited falls back to the app shell,
    // which can still render the editor offline.
    const shell = await caches.match(SHELL, MATCH);
    if (shell) return shell;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, MATCH);
  if (cached) return cached;
  return put(request, await fetch(request));
}

/**
 * Serve from cache at once and refresh in the background for the next load.
 * Returns the refresh promise alongside the response so the caller can hand it
 * to event.waitUntil — without that the worker can be shut down the moment it
 * responds, and the refresh never lands.
 */
function staleWhileRevalidate(request) {
  const refresh = fetch(request)
    .then((response) => put(request, response))
    .catch(() => undefined);
  const response = caches.match(request, MATCH).then(async (cached) => {
    if (cached) return cached;
    const fetched = await refresh;
    if (fetched) return fetched;
    throw new Error('offline and uncached');
  });
  return { response, refresh };
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (isStaticAsset(url)) {
    const { response, refresh } = staleWhileRevalidate(request);
    event.respondWith(response);
    event.waitUntil(refresh);
  }
});
