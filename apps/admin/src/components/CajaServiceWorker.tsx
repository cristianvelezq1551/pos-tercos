'use client';

import { useEffect } from 'react';

/**
 * Registra el Service Worker de la caja SOLO en producción y SOLO cuando este
 * componente se monta — vive en `caja/layout.tsx`, así que el DUEÑO (que nunca
 * entra a la caja) jamás lo registra. En dev NUNCA se registra (HMR + caché del
 * SW pelean y sirven bundles viejos) y se limpia cualquier resto.
 * Unificación POS+admin, Fase 3.
 */
export function CajaServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    } else {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => undefined);
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => undefined);
      }
    }
  }, []);
  return null;
}
