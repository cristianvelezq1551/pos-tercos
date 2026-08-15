/**
 * Evento global "la caja cambió" — lo dispara cualquier acción que mueva
 * efectivo (venta cobrada, anulación, movimiento de caja) para que el badge
 * del topbar y los paneles refresquen al instante sin esperar el polling.
 *
 * Vive en `lib/` y no dentro de `caja-shifts` porque lo emiten `sales` y lo
 * escucha `caja-shifts`: como `caja-shifts` ya importa el barril de `sales`,
 * colgarlo de un feature obligaba a `sales` a importarlo por ruta profunda
 * para esquivar el ciclo — rompiendo la regla de "solo por el index.ts". Un
 * bus de eventos es transversal, no propiedad de un feature.
 */
const CAJA_CHANGED_EVENT = 'pos:caja-changed';

export function notifyCajaChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CAJA_CHANGED_EVENT));
  }
}

export function onCajaChanged(handler: () => void): () => void {
  window.addEventListener(CAJA_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CAJA_CHANGED_EVENT, handler);
}
