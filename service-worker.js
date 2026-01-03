/* Spese Daedalium - Service Worker (PWA) */
const CACHE_NAME = "spese-daedalium-1.017";
const ASSETS = [
"./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./assets/logo.jpg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-32.png",
  "./assets/bg-daedalium.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve(true))))
    ).then(() => self.clients.claim())
  );
});

async function networkFirst(request){
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

async function cacheFirst(request){
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Non gestire chiamate API o cross-origin
  if (url.origin !== self.location.origin) return;

  // Solo GET
  if (req.method !== "GET") return;

  // Navigazioni: network-first
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // Static assets: cache-first
  event.respondWith(cacheFirst(req));
});
