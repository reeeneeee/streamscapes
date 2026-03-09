// Minimal service worker for PWA installability.
// Network-first strategy — always fetch from network, fall back to cache.
// Only cache the app shell, NOT JS/CSS chunks (Next.js handles those with content hashes).

const CACHE_NAME = 'streamscapes-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Never cache API, stream, or Next.js chunk requests
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/')) return;

  // Only cache the app shell (icons, manifest, root page)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && (url.pathname.match(/\.(svg|png|woff2?)$/) || url.pathname === '/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
