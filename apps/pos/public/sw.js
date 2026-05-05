/**
 * Service Worker minimalista (FASE 15.D).
 *
 * Estrategia "online-first con offline fallback":
 *  - GETs van directo a la red. Si falla y la URL es navegacional,
 *    devolvemos /offline.html.
 *  - Static assets (JS/CSS bundleados de Next) se cachean stale-while-
 *    revalidate para que un reload offline siga viendo la última UI.
 *  - POSTs/PATCHes/DELETEs NUNCA se cachean — pasan derecho.
 *
 * El cache se versiona con la URL del worker; cambiar este string en
 * un deploy invalida todo el cache anterior.
 */

const CACHE_VERSION = 'pos-tercos-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([OFFLINE_URL, '/manifest.json', '/icon-192.svg', '/icon-512.svg']),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET passes by SW.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // No cachear API ni websockets ni rutas con auth (cookies).
  if (url.pathname.startsWith('/api/')) return;

  // Static assets: stale-while-revalidate.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Navegacional: network-first con fallback offline.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
});

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    return res;
  } catch (err) {
    const cache = await caches.open(STATIC_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return offline ?? new Response('offline', { status: 503 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached ?? fetchPromise;
}
