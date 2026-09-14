import type { FixedCost } from '@pos-tercos/types';

export interface ParticionDeCostos {
  /** Se repiten solos: mensuales y anuales. */
  recurrentes: FixedCost[];
  /** Pasan una vez (aceite, aseo, una reparación). */
  unicos: FixedCost[];
  /** Suma mensual de los recurrentes ACTIVOS (anual ÷ 12). */
  totalRecurrenteMensual: number;
  /** Suma de los gastos únicos ACTIVOS. NO es una cifra mensual. */
  totalUnicos: number;
  recurrentesActivos: number;
  unicosActivos: number;
}

/**
 * Parte el catálogo en los dos grupos que la pantalla muestra por separado.
 *
 * El punto de la separación es el TOTAL: "al mes" solo tiene sentido para lo
 * que se repite. Meter un gasto único dentro del total mensual lo infla para
 * siempre — una reparación de marzo seguiría contándose en septiembre.
 */
export function partirCostos(costs: FixedCost[]): ParticionDeCostos {
  const recurrentes = costs.filter((c) => c.frequency !== 'ONE_TIME');
  const unicos = costs.filter((c) => c.frequency === 'ONE_TIME');
  const recurrentesActivos = recurrentes.filter((c) => c.isActive);
  const unicosActivos = unicos.filter((c) => c.isActive);

  return {
    recurrentes,
    unicos,
    totalRecurrenteMensual: recurrentesActivos.reduce(
      (acc, c) => acc + (c.frequency === 'ANNUAL' ? c.amount / 12 : c.amount),
      0,
    ),
    totalUnicos: unicosActivos.reduce((acc, c) => acc + c.amount, 0),
    recurrentesActivos: recurrentesActivos.length,
    unicosActivos: unicosActivos.length,
  };
}
