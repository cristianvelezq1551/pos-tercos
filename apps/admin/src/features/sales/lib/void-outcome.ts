/**
 * Anular una venta tiene DOS desenlaces distintos en los libros, y cuál
 * corresponde depende de un hecho que el sistema no puede saber solo: si la
 * comida salió o no.
 *
 * - No salió (se cobró por error, el cliente se arrepintió antes): los insumos
 *   siguen ahí → se devuelve el inventario y no cuesta nada.
 * - Sí salió (se preparó y el cliente pidió la plata de vuelta): los insumos ya
 *   se gastaron → el inventario NO vuelve y el costo queda como pérdida del mes
 *   (`refundCost` en el P&G), aunque la venta salga de los ingresos.
 *
 * Antes esto lo decidía el ESTADO del pedido, pero desde que se eliminó el KDS
 * (§7.v10) una venta de mostrador nace y muere en PAGADO: no había forma de
 * llegar al segundo caso, así que toda devolución devolvía el inventario y la
 * pérdida desaparecía de los libros.
 */
export type VoidOutcome = 'no-salio' | 'si-salio';

export interface VoidOutcomeOption {
  value: VoidOutcome;
  label: string;
  /** Qué le pasa al inventario y a las cuentas. Se muestra junto a la opción. */
  consequence: string;
}

export const VOID_OUTCOMES: VoidOutcomeOption[] = [
  {
    value: 'no-salio',
    label: 'No, se cobró por error',
    consequence: 'Vuelve el inventario y no cuesta nada: los insumos siguen en la bodega.',
  },
  {
    value: 'si-salio',
    label: 'Sí, ya se había preparado',
    consequence:
      'El inventario NO vuelve porque los insumos ya se gastaron. Queda como pérdida del mes.',
  },
];

/** El desenlace elegido decide qué endpoint se llama. */
export function endpointForOutcome(outcome: VoidOutcome): 'void' | 'refund' {
  return outcome === 'si-salio' ? 'refund' : 'void';
}

/** Verbo para el botón y los avisos, para no escribirlo suelto en cada lugar. */
export function outcomeVerb(outcome: VoidOutcome): { action: string; gerund: string } {
  return outcome === 'si-salio'
    ? { action: 'Devolver la plata', gerund: 'Devolviendo…' }
    : { action: 'Anular venta', gerund: 'Anulando…' };
}
