import type { CashierAnomalies, ShiftAnomalyFlag } from '@pos-tercos/types';

export const FLAG_LABEL: Record<ShiftAnomalyFlag, string> = {
  diff_high: 'Descuadre fuera de norma',
  voids_high: 'Anulaciones fuera de norma',
  noSale_high: 'Aperturas de cajón sin venta fuera de norma',
};

export type Turno = CashierAnomalies['shifts'][number];

/**
 * Un campo AUSENTE y un campo en null no son lo mismo: ausente es un API que
 * todavía no lo manda (API y admin se despliegan por separado) y null es un
 * turno que cerró con un medio sin arquear. Si el campo no viene, las columnas
 * de cuenta y total no se dibujan — mostrarlas en "sin arquear" sería afirmar
 * algo que nadie dijo.
 */
export function traeElTotal(shifts: CashierAnomalies['shifts']): boolean {
  return shifts.some((s) => s.totalDifference !== undefined);
}
