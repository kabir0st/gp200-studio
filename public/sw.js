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

/** Hashed build output: content-addressed, so it can be trusted forever. */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/assets/');
}

/** Static files served under their own names (art, drum kits, icons, sounds). */
function isStaticAsset(url) {
  return /\.(png|jpg|jpeg|svg|webp|woff2?|wav|mp3|ogg|ico|webmanifest)$/i.test(url.pathname);
}

self.addEventListener('install', (event) => {
  // Take over as soon as the new worker is ready; combined with the
  // network-first navigation rule this keeps deploys landing promptly.
  event.waitUntil(self.skipWaiting());
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
    const cached = await caches.match(request);
    if (cached) return cached;
    // A deep guide URL that was never visited falls back to the app shell,
    // which can still render the editor offline.
    const shell = await caches.match('/');
    if (shell) return shell;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
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
  const response = caches.match(request).then(async (cached) => {
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
