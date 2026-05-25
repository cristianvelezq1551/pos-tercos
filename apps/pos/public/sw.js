/**
 * Service Worker del POS (Fase B.0b) — "online-first, abre offline".
 *
 * Cambio clave vs. la versión anterior: ahora el POS ABRE aunque no haya red.
 *  - Navegaciones (documentos): network-first PERO se cachea la última respuesta
 *    buena. Offline se sirve esa shell cacheada (la última `/` que cargó online),
 *    y solo si nunca hubo una, cae a /offline.html. Online siempre va a la red
 *    primero → cero staleness online.
 *  - Static de Next (/_next/static/*): stale-while-revalidate.
 *  - /api/* y no-GET: NUNCA se tocan (pasan derecho).
 *
 * Bug corregido: la versión previa precacheaba /icon-192.svg y /icon-512.svg
 * (no existen) → cache.addAll rechazaba y el SW NUNCA se instalaba.
 *
 * El cache se versiona con CACHE_VERSION; subirlo en un deploy invalida todo.
 */

const CACHE_VERSION = 'pos-tercos-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const NAV_CACHE = `${CACHE_VERSION}-nav`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    // Solo recursos que EXISTEN (si uno da 404, addAll rechaza y no instala).
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, '/manifest.json'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API / WS / auth: nunca por el SW.
  if (url.pathname.startsWith('/api/')) return;

  // Static de Next: stale-while-revalidate.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Navegaciones (documentos): network-first + cache de respaldo offline.
  if (req.mode === 'navigate') {
    event.respondWith(navNetworkFirst(req));
    return;
  }
});

async function navNetworkFirst(req) {
  const cache = await caches.open(NAV_CACHE);
  try {
    const res = await fetch(req);
    // Cacheá la última navegación buena para servirla offline después.
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    // Sin red: la misma ruta cacheada → la shell `/` → offline.html.
    const exact = await cache.match(req);
    if (exact) return exact;
    const home = await cache.match('/');
    if (home) return home;
    const offline = await (await caches.open(STATIC_CACHE)).match(OFFLINE_URL);
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
