import type { FixedCost } from '@pos-tercos/types';

export interface MesElegido {
  year: number;
  /** 1-12 */
  month: number;
}

export interface ParticionDeCostos {
  /** Se repiten solos: mensuales y anuales. */
  recurrentes: FixedCost[];
  /** Gastos únicos cuya fecha cae en el mes elegido. */
  unicos: FixedCost[];
  /** Gastos únicos SIN fecha: no pertenecen a ningún mes (ni al estado financiero). */
  unicosSinFecha: FixedCost[];
  /** Suma mensual de los recurrentes ACTIVOS (anual ÷ 12). */
  totalRecurrenteMensual: number;
  /** Suma de los gastos únicos ACTIVOS del mes elegido. */
  totalUnicos: number;
  recurrentesActivos: number;
  unicosActivos: number;
}

/**
 * El mes al que pertenece un gasto único es el del CALENDARIO de su fecha: es
 * la misma clave con la que el backend guarda su pago (`paymentPeriodFor`) y,
 * con el mes de negocio fijo en el día 1 (§7.v73), la misma ventana en la que
 * lo cuenta el estado financiero.
 */
export function esDelMes(ymd: string, mes: MesElegido): boolean {
  const [y, m] = ymd.split('-').map(Number);
  return y === mes.year && m === mes.month;
}

/**
 * Parte el catálogo en los dos grupos que la pantalla muestra por separado.
 *
 * Los recurrentes van completos: son pocos y pesan todos los meses. Los únicos
 * se acotan al mes elegido — listarlos todos juntaba el aceite de septiembre
 * con el de noviembre y el total no correspondía a ningún mes.
 */
export function partirCostos(costs: FixedCost[], mes: MesElegido): ParticionDeCostos {
  const recurrentes = costs.filter((c) => c.frequency !== 'ONE_TIME');
  const todosLosUnicos = costs.filter((c) => c.frequency === 'ONE_TIME');
  const unicos = todosLosUnicos
    .filter((c) => c.startedAt !== null && esDelMes(c.startedAt, mes))
    .sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''));
  const unicosSinFecha = todosLosUnicos.filter((c) => c.startedAt === null);
  const recurrentesActivos = recurrentes.filter((c) => c.isActive);
  const unicosActivos = unicos.filter((c) => c.isActive);

  return {
    recurrentes,
    unicos,
    unicosSinFecha,
    totalRecurrenteMensual: recurrentesActivos.reduce(
      (acc, c) => acc + (c.frequency === 'ANNUAL' ? c.amount / 12 : c.amount),
      0,
    ),
    totalUnicos: unicosActivos.reduce((acc, c) => acc + c.amount, 0),
    recurrentesActivos: recurrentesActivos.length,
    unicosActivos: unicosActivos.length,
  };
}
