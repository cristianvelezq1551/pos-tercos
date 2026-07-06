/**
 * Evento global "la comanda NO se imprimió" (informe de calidad A2). La
 * impresión post-cobro es fire-and-forget para no bloquear la venta, pero un
 * fallo NO puede quedar solo en el log: cocina no vio el pedido y nadie se
 * enteraba. `ComandaFailureAlert` (montado en el layout) escucha y muestra un
 * aviso persistente con reintento.
 */

export type ComandaFailureKind = 'comanda' | 'tanda' | 'anulacion' | 'modificada';

export interface ComandaFailure {
  saleId: string;
  /** Nº de recibo para que el cajero identifique el pedido (si se conoce). */
  receiptNumber: number | null;
  kind: ComandaFailureKind;
}

const COMANDA_FAILED_EVENT = 'pos:comanda-failed';

export function notifyComandaFailed(failure: ComandaFailure): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(COMANDA_FAILED_EVENT, { detail: failure }));
  }
}

export function onComandaFailed(handler: (f: ComandaFailure) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ComandaFailure>).detail);
  window.addEventListener(COMANDA_FAILED_EVENT, listener);
  return () => window.removeEventListener(COMANDA_FAILED_EVENT, listener);
}
