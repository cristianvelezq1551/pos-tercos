import { DELIVERY_PAYOUT_PURPOSE, type CashMovement } from '@pos-tercos/types';

/**
 * Un domicilio que el cliente transfirió y se pagó en efectivo del cajón,
 * reconstruido desde sus dos patas (§7.v71).
 */
export interface DeliveryPayout {
  pairId: string;
  amount: number;
  /** Lo que el cajero escribió para reconocerlo ("pedido de la 30"). */
  note: string | null;
  createdAt: string;
  userName: string | null;
}

const esDomicilio = (m: CashMovement): boolean => m.purpose === DELIVERY_PAYOUT_PURPOSE;

/**
 * Agrupa las patas por su pareja. Se lee de la SALIDA en efectivo: es la que
 * lleva el monto que salió del cajón, que es lo que el cajero va a reconocer.
 *
 * Una pata sin pareja (que no debería existir: el backend las crea y las borra
 * juntas) simplemente no arma un domicilio, en vez de mostrar uno a medias.
 */
export function agruparDomicilios(movements: readonly CashMovement[]): DeliveryPayout[] {
  return movements
    .filter((m) => esDomicilio(m) && m.type === 'OUT' && m.pairId)
    .map((m) => ({
      pairId: m.pairId as string,
      amount: m.amount,
      note: notaDe(m.reason),
      createdAt: m.createdAt,
      userName: m.userName ?? null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Total que salió del cajón por domicilios, para la línea del cierre. */
export function totalDomicilios(movements: readonly CashMovement[]): number {
  return agruparDomicilios(movements).reduce((acc, d) => acc + d.amount, 0);
}

/**
 * Los movimientos que NO son parte de un domicilio: los sueltos de siempre.
 * La lista de entradas y salidas los muestra aparte para no repetir en dos
 * lugares la misma plata.
 */
export function movimientosSueltos(movements: readonly CashMovement[]): CashMovement[] {
  return movements.filter((m) => !esDomicilio(m));
}

/** El motivo guardado es "<texto fijo> · <nota>"; acá vuelve solo la nota. */
function notaDe(reason: string): string | null {
  const sep = reason.indexOf(' · ');
  return sep === -1 ? null : reason.slice(sep + 3).trim() || null;
}
