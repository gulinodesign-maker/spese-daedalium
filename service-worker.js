/* dDAE - Service Worker (PWA) */
/* Build: dDAE_1.036 */

const BUILD = "1.036";
const CACHE_NAME = "dDAE_1.036"; // cambia ad ogni build

// Asset principali (versionati per forzare il fetch anche con cache aggressiva iOS)
const CORE_ASSETS = [
  "./",
  "./index.html?v=1.036",
  "./styles.css?v=1.036",
  "./app.js?v=1.036",
  "./config.js?v=1.036",
  "./manifest.json?v=1.036",
  "./assets/logo.jpg",
  "./assets/bg-daedalium.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-32.png",
  "./assets/icons/favicon-32.png",
  "./assets/icons/favicon-16.png",
  "./assets/icons/apple-touch-icon.png",
];

// Install: precache + skipWaiting (fix aggiornamenti su iOS)
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // "reload" bypassa la HTTP cache del browser
    const reqs = CORE_ASSETS.map((url) => new Request(url, { cache: "reload" }));
    await cache.addAll(reqs);
    self.skipWaiting();
  })());
});

// Activate: cleanup cache vecchie + claim
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k !== CACHE_NAME) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

// Messaggi (fallback)
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isApiRequest(req) {
  const url = new URL(req.url);
  return (
    url.origin.includes("script.google.com") ||
    url.origin.includes("script.googleusercontent.com")
  );
}

async function networkFirstHTML(req) {
  const cache = await caches.open(CACHE_NAME);

  try {
    // no-store per HTML/navigazioni: evita cache aggressiva iOS/Safari
    const fresh = await fetch(new Request(req.url, { cache: "no-store" }));
    if (fresh && fresh.ok) {
      // salva una copia (match con ignoreSearch durante il fetch)
      await cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (e) {
    // fallback: prova cache ignorando querystring
    const cached =
      (await cache.match(req, { ignoreSearch: true })) ||
      (await cache.match("./index.html", { ignoreSearch: true })) ||
      (await cache.match("./", { ignoreSearch: true }));
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req, { ignoreSearch: true });

  const fetchPromise = fetch(new Request(req.url, { cache: "no-store" }))
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  return cached || (await fetchPromise);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== "GET") return;

  // API: mai in cache
  if (isApiRequest(req)) {
    event.respondWith(fetch(new Request(req.url, { cache: "no-store" })));
    return;
  }

  // Navigazioni / HTML: network-first
  const accept = req.headers.get("accept") || "";
  if (req.mode === "navigate" || accept.includes("text/html")) {
    event.respondWith(networkFirstHTML(req));
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});
