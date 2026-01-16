/* dDAE - Service Worker (PWA)
 * Build: dDAE_1.273
 *
 * Obiettivi:
 * - cache name cambia ad ogni build
 * - network-first per index.html / navigazioni
 * - no-cache per chiamate API
 * - cleanup cache vecchie
 * - fix iOS/Safari cache aggressiva (cache:"reload"/"no-store" + query ?v)
 */

const BUILD = "1.273";
const CACHE_NAME = `dDAE-cache-${BUILD}`; // cambia ad ogni build // cambia ad ogni build

// Asset principali (versionati per forzare il fetch anche con cache aggressiva iOS)
const CORE_ASSETS = [
  "./",
  "./index.html",
  `./index.html?v=${BUILD}`,
  `./styles.css?v=${BUILD}`,
  `./app.js?v=${BUILD}`,
  `./config.js?v=${BUILD}`,
  `./manifest.json?v=${BUILD}`,

  // Immagini / icone (alcune linkate con ?v=... da index.html)
  `./assets/logo.jpg?v=${BUILD}`,
  `./assets/bg-daedalium.png?v=${BUILD}`,
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  `./assets/icons/icon-192.png?v=${BUILD}`,
  `./assets/icons/icon-512.png?v=${BUILD}`,
  `./assets/icons/favicon-32.png?v=${BUILD}`,
  `./assets/icons/favicon-16.png?v=${BUILD}`,
  `./assets/icons/apple-touch-icon.png?v=${BUILD}`,
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // "reload" bypassa la HTTP cache del browser (utile su iOS/Safari)
    const reqs = CORE_ASSETS.map((url) => new Request(url, { cache: "reload" }));

    // Mettiamo in cache ciò che risponde ok
    await Promise.all(reqs.map(async (req) => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          await cache.put(req, res.clone());
        }
      } catch (_) {
        // offline durante install: ok, si prosegue
      }
    }));

    // Applica subito il nuovo SW (poi l'app invia anche SKIP_WAITING)
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // cleanup cache vecchie
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));

    // prendi controllo immediato
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isApiRequest(url) {
  // Evita cache per chiamate a Google Apps Script / Googleusercontent
  return (
    url.hostname.includes("script.google.com") ||
    url.hostname.includes("script.googleusercontent.com")
  );
}



async function networkFirstAsset(req){
  const cache = await caches.open(CACHE_NAME);
  try{
    const fresh = await fetch(req, { cache: "no-store" });
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  }catch(_){
    const cached = await cache.match(req);
    if (cached) return cached;
    throw _;
  }
}
async function networkFirstHTML(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // no-store per evitare cache aggressiva iOS sulla navigazione
    const fresh = await fetch(new Request(req, { cache: "no-store" }));
    if (fresh && fresh.ok) {
      await cache.put(req, fresh.clone());
      return fresh;
    }
    throw new Error("bad response");
  } catch (_) {
    // fallback: prova a servire l'HTML dalla cache (anche ignorando la query)
    return (
      (await cache.match(req)) ||
      (await cache.match("./index.html")) ||
      (await cache.match(`./index.html?v=${BUILD}`)) ||
      (await cache.match(req, { ignoreSearch: true })) ||
      new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
    );
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const url = new URL(req.url);
  const hasSearch = !!url.search;

  // Per asset versionati (?v=...), NON ignorare la query: serve a forzare l'update su iOS.
  const cached =
    (await cache.match(req)) ||
    (!hasSearch ? await cache.match(req, { ignoreSearch: true }) : null);

  const fetchPromise = (async () => {
    try {
      // no-store per minimizzare problemi di cache aggressiva
      const res = await fetch(new Request(req, { cache: "no-store" }));
      if (res && res.ok) {
        await cache.put(req, res.clone());
      }
      return res;
    } catch (_) {
      return null;
    }
  })();

  // Se c'è cache, rispondi subito e aggiorna in background
  if (cached) {
    fetchPromise.catch(() => {});
    return cached;
  }

  // Altrimenti prova rete, poi fallback
  const net = await fetchPromise;
  return net || new Response("Offline", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  // version.json: mai cache, sempre rete
  try {
    const u = new URL(event.request.url);
    if (u.origin === self.location.origin && u.pathname.endsWith("/version.json")) {
      event.respondWith(fetch(event.request, { cache: "no-store" }));
      return;
    }
  } catch (_) {}

  // Core assets: sempre network-first (evita JS/CSS vecchi su iOS)
  try {
    const u2 = new URL(event.request.url);
    const p = u2.pathname;
    const isSame = u2.origin === self.location.origin;
    const coreAssets = ["/app.js","/styles.css","/config.js","/manifest.json"];
    if (isSame && coreAssets.some(a => p.endsWith(a))) {
      event.respondWith(networkFirstAsset(event.request));
      return;
    }
  } catch (_) {}

  const req = event.request;

  // Solo GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Non cache API
  if (isApiRequest(url)) {
    event.respondWith(fetch(new Request(req, { cache: "no-store" })));
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
