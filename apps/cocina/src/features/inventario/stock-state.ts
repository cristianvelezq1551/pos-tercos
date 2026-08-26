import type { Stockable } from '@pos-tercos/types';

export type StockState = 'ok' | 'low' | 'unregistered';

/**
 * En qué estado está un insumo, desde el punto de vista del cocinero.
 *
 * Antes solo había dos: con `lowStock` salía un aviso ámbar "Bajo", y un stock
 * NEGATIVO caía en ese mismo aviso. Son dos problemas distintos y solo uno lo
 * resuelve el cocinero:
 *
 * - `low`: queda poco → producir o avisar que se pida.
 * - `unregistered`: el sistema tiene MENOS QUE CERO, o sea que se consumió más
 *   de lo que estaba cargado (casi siempre falta subir una factura). El stock
 *   está en la nevera; lo que falta es el respaldo. Al cocinero le sirve
 *   contarlo, no producir más.
 */
export function stockState(s: Pick<Stockable, 'currentStock' | 'lowStock'>): StockState {
  if (s.currentStock < 0) return 'unregistered';
  return s.lowStock ? 'low' : 'ok';
}

/**
 * Las porciones solo se muestran cuando el número significa algo. Con stock
 * negativo la app decía "−28 porc.", que no quiere decir nada: no existen
 * porciones negativas y leerlo solo confunde.
 */
export function portionsToShow(
  s: Pick<Stockable, 'currentStock' | 'portions'>,
): number | null {
  if (s.portions == null || s.currentStock < 0) return null;
  return s.portions;
}

/**
 * Qué hacer cuando el sistema tiene menos de cero. El consejo cambia con el
 * tipo: un insumo se COMPRA (falta la factura) y un subproducto se PRODUCE
 * (falta registrar la tanda). Decirle al cocinero que falta una compra de
 * "Pollo sazonado" lo manda a buscar una factura que no existe.
 */
export function unregisteredHint(type: Stockable['type']): string {
  return type === 'SUBPRODUCT'
    ? 'Hay menos de cero en el sistema: se usó más de lo que se registró como producido. Cuéntalo en Conteo físico.'
    : 'Hay menos de cero en el sistema: falta registrar una compra. Cuéntalo en Conteo físico.';
}
