/* HealthPilot service worker — offline app shell.
 * Navigations: network-first (fresh deploys win), cached fallback offline.
 * Hashed /assets/*, the /anatomy/ model and /thumbs/: cache-first. Those two folders are
 * not hashed, so bump CACHE whenever they change. API calls: never cached. */
const CACHE = 'healthpilot-v7';
// Relative to this script, so it works at a domain root or in a subfolder.
const SHELL = ['./', './index.html', './icon.svg', './manifest.webmanifest'];
const INDEX = new URL('./index.html', self.location).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => { caches.open(CACHE).then((c) => c.put(INDEX, res.clone())); return res; })
        .catch(() => caches.match(INDEX)),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/anatomy/') || url.pathname.includes('/thumbs/'))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    })),
  );
});
