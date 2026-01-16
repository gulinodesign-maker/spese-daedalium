/* dDAE service worker (template)
 * - cache versionata
 * - cleanup cache vecchie
 * - skipWaiting + clientsClaim
 * - network-first per index e navigazioni
 * - cache mirata per asset statici
 * - NO cache per chiamate API
 */

const BUILD_VERSION = '1.195';
const CACHE_NAME = `ddae-cache-${BUILD_VERSION}`;
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './app.js',
  './manifest.json',
  './favicon-16.png',
  './favicon-32.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './logo.jpg',
  './bg-daedalium.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // cleanup
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

function isApiRequest(req) {
  const url = new URL(req.url);
  // Heuristics: Apps Script endpoint OR action/apiKey params
  if (url.hostname.includes('script.google.com')) return true;
  if (url.searchParams.has('action') || url.searchParams.has('apiKey')) return true;
  return false;
}

function isNavigationRequest(req) {
  return req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // NO CACHE per API
  if (isApiRequest(req)) {
    event.respondWith(fetch(req));
    return;
  }

  // network-first per index/navigazioni
  if (isNavigationRequest(req) || req.url.endsWith('/index.html')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // cache-first per asset statici
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const fresh = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, fresh.clone());
    return fresh;
  })());
});
