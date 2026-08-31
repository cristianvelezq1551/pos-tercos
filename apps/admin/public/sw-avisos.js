/**
 * Service Worker de las NOTIFICACIONES del navegador (Web Push).
 *
 * Separado del de la caja (`sw.js`) a propósito:
 *   - Aquel se registra SOLO dentro de `/caja` y SOLO en producción, así que el
 *     dueño —que nunca entra a la caja— jamás lo tendría, y sin registro no hay
 *     notificaciones. Este se registra desde la pantalla de Avisos, para quien
 *     sea que active los avisos.
 *   - Aquel cachea navegaciones y estáticos; este NO tiene un solo `fetch`. Por
 *     eso puede vivir también en desarrollo, donde el otro se desregistra a
 *     propósito (el HMR y la caché del SW pelean y sirven bundles viejos).
 *
 * Su ámbito es `/sw-avisos/`, una ruta que no existe ni va a existir: así los
 * dos service workers conviven sin pisarse. El ámbito no limita a quién le
 * llegan los avisos — el push se entrega a la registración que creó la
 * suscripción, no a la que controla la página abierta.
 */

self.addEventListener('push', (event) => {
  // Sin datos no se muestra nada: un aviso vacío ("Notificación") solo enseña
  // que algo se rompió. Aun así hay que responder, o el navegador puede
  // mostrar su propio aviso genérico.
  let datos = null;
  try {
    datos = event.data ? event.data.json() : null;
  } catch {
    datos = null;
  }
  if (!datos || !datos.title) return;

  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Agrupa por tema: un descuadre nuevo reemplaza al anterior en vez de
      // apilar avisos que hay que descartar de a uno.
      tag: datos.tag || 'tercos',
      // Con `renotify` el reemplazo vuelve a sonar; sin esto, el segundo
      // descuadre de la noche entraría en silencio.
      renotify: Boolean(datos.tag),
      data: { url: datos.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const abiertas = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Reusar la pestaña abierta en vez de abrir otra: quien ya tiene el admin
      // abierto no quiere terminar con seis pestañas iguales.
      for (const cliente of abiertas) {
        if (new URL(cliente.url).origin === self.location.origin) {
          await cliente.focus();
          if ('navigate' in cliente) await cliente.navigate(destino).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(destino);
    })(),
  );
});

// Tomar el control apenas se instala: sin esto el primer aviso tendría que
// esperar a que se cierren todas las pestañas.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
