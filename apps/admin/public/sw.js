/**
 * Service Worker de la CAJA unificada (unificación POS+admin, Fase 3).
 *
 * REGLA DURA: este SW SOLO cachea y sirve offline navegaciones bajo `/caja/*`.
 * Las páginas de GESTIÓN (finanzas, reportes, inventario, etc.) pasan DERECHO a
 * la red — nunca se cachean ni se sirven desde caché. Servir una página
 * financiera vieja sería peligroso; por eso el guard `isCajaNav`.
 *
 * - Navegaciones `/caja/*`: network-first + shell cacheada de respaldo offline.
 * - Navegaciones NO-`/caja`: se ignoran (return) → la red las maneja; offline
 *   fallan naturalmente (gestión no es offline-first).
 * - Static de Next (`/_next/static/*`): stale-while-revalidate (chunks
 *   inmutables con hash; compartidos, seguro cachearlos).
 * - `/api/*` y no-GET: NUNCA se tocan.
 *
 * Subir CACHE_VERSION invalida todo. Bump al agregar rutas al warm-up.
 */

const CACHE_VERSION = 'admin-caja-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const NAV_CACHE = `${CACHE_VERSION}-nav`;
const OFFLINE_URL = '/offline.html';

// Solo pestañas de CAJA se precalientan para abrir offline.
const NAV_WARMUP = ['/caja', '/caja/historial', '/caja/cierre', '/caja/arqueos', '/caja/shift/open'];

/** True si la URL es una navegación del modo Caja (única superficie offline). */
function isCajaNav(url) {
  return url.pathname === '/caja' || url.pathname.startsWith('/caja/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, '/manifest.webmanifest'])),
      caches.open(NAV_CACHE).then((cache) =>
        Promise.all(
          NAV_WARMUP.map((path) =>
            fetch(path)
              .then((res) => (res && res.ok ? cache.put(path, res.clone()) : undefined))
              .catch(() => undefined),
          ),
        ),
      ),
    ]),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Al cerrar sesión el cliente pide limpiar la shell cacheada: la caja SSR
// cacheada lleva datos del operativo anterior. Sin esto, otro operativo en el
// mismo equipo podría ver offline la shell del turno previo.
self.addEventListener('message', (event) => {
  if (event.data === 'clear-nav-cache') {
    event.waitUntil(caches.delete(NAV_CACHE));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API / WS / auth: nunca por el SW.
  if (url.pathname.startsWith('/api/')) return;

  // Static de Next: stale-while-revalidate (seguro; chunks con hash).
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Navegaciones: SOLO la caja es offline-first. Gestión pasa derecho.
  if (req.mode === 'navigate') {
    if (isCajaNav(url)) {
      event.respondWith(cajaNavNetworkFirst(req));
    }
    // else: no respondWith → la red maneja gestión; nunca se cachea/sirve stale.
    return;
  }
});

async function cajaNavNetworkFirst(req) {
  const cache = await caches.open(NAV_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    // Sin red: la misma ruta de caja cacheada → la shell '/caja' → offline.html.
    const exact = await cache.match(req);
    if (exact) return exact;
    const cajaHome = await cache.match('/caja');
    if (cajaHome) return cajaHome;
    const offline = await (await caches.open(STATIC_CACHE)).match(OFFLINE_URL);
    return offline ?? new Response('offline', { status: 503 });
  }
}

/**
 * Static de Next (chunks con hash, inmutables).
 *
 * Si hay copia local se sirve y se refresca en segundo plano. Si no hay, se
 * pide a la red con UN reintento: en el local la conexión parpadea, y un chunk
 * que no llega no degrada la pantalla — la tumba entera con "Algo salió mal".
 * Un 404 no se reintenta (ese archivo no existe; insistir solo demora el error).
 */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  if (cached) {
    fetch(req)
      .then((res) => (res && res.ok ? cache.put(req, res.clone()) : undefined))
      .catch(() => undefined);
    return cached;
  }
  try {
    return await pedirYGuardar(cache, req);
  } catch (primerFallo) {
    try {
      return await pedirYGuardar(cache, req);
    } catch {
      // Se propaga el fallo REAL en vez de resolver a `undefined`, que al
      // navegador le llega como un error de red inventado por el SW.
      throw primerFallo;
    }
  }
}

async function pedirYGuardar(cache, req) {
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}
