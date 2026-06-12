/**
 * Evento global "la caja cambió" — lo dispara cualquier acción que mueva
 * efectivo (venta cobrada, anulación, movimiento de caja) para que el badge
 * del topbar y los paneles refresquen al instante sin esperar el polling.
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
