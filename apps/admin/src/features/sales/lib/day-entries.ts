import type { CortesiaRequest, Sale } from '@pos-tercos/types';
import type { HistoryFilter } from './history-filters';

/**
 * Una fila del historial del día. Las cortesías NO son ventas (no tienen recibo
 * ni pago), pero sí son pedidos que salieron de la cocina: van en la misma
 * lista para que el cajero tenga la operación del día completa en un solo lugar.
 */
export type DayEntry =
  | { kind: 'sale'; id: string; at: string; sale: Sale }
  | { kind: 'cortesia'; id: string; at: string; cortesia: CortesiaRequest };

/** Ventas + cortesías en una sola lista, más reciente primero. */
export function mergeDayEntries(
  sales: readonly Sale[],
  cortesias: readonly CortesiaRequest[],
): DayEntry[] {
  const entries: DayEntry[] = [
    ...sales.map((sale): DayEntry => ({
      kind: 'sale',
      id: sale.id,
      at: sale.createdAt,
      sale,
    })),
    ...cortesias.map((cortesia): DayEntry => ({
      kind: 'cortesia',
      id: cortesia.id,
      at: cortesia.createdAt,
      cortesia,
    })),
  ];
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/**
 * Los filtros por estado (Pend. pago, Pagados, Listos, Anulados) son estados de
 * VENTA: una cortesía no se cobra ni se anula, así que solo aparece en «Todos»
 * (y en su propia pestaña, que filtra aparte).
 */
export function entryMatchesFilter(entry: DayEntry, filter: HistoryFilter): boolean {
  if (entry.kind === 'cortesia') return filter.key === 'todos';
  return filter.match(entry.sale.status);
}
