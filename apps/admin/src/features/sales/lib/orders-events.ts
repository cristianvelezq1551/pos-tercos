/**
 * Evento global "los pedidos cambiaron" — lo dispara cualquier acción que
 * cree/edite/cobre/cancele un pedido para que el panel de pedidos (#2)
 * refresque al instante sin esperar el polling.
 */
const ORDERS_CHANGED_EVENT = 'pos:orders-changed';

export function notifyOrdersChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ORDERS_CHANGED_EVENT));
  }
}

export function onOrdersChanged(handler: () => void): () => void {
  window.addEventListener(ORDERS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(ORDERS_CHANGED_EVENT, handler);
}
