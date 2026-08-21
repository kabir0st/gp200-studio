/**
 * Registers the offline service worker (public/sw.js).
 *
 * Production only: a worker in front of the dev server fights HMR, and
 * `vite preview` is a production build so the offline path is still testable
 * locally.
 *
 * `?nosw=1` unregisters instead and clears the caches. A bad service worker is
 * the one kind of front-end bug a user cannot clear by reloading, so the escape
 * hatch ships with it rather than after the first time it is needed.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  if (new URLSearchParams(window.location.search).has('nosw')) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) void registration.unregister();
    });
    if ('caches' in window) {
      void caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name))));
    }
    return;
  }

  if (!import.meta.env.PROD) return;

  // After load, so the first paint never competes with the registration.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support is a bonus; a registration failure must not surface
      // to the user or affect anything else on the page.
    });
  });
}
