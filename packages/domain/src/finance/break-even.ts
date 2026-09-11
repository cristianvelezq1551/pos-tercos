/**
 * Punto de equilibrio: cuánto hay que vender para no perder plata.
 *
 * La fórmula es `costos fijos / margen de CONTRIBUCIÓN %`, y la palabra que
 * importa es "contribución": el porcentaje tiene que descontar TODO lo que se
 * mueve con las ventas, no solo el costo de la comida vendida.
 *
 * Antes se usaba el margen BRUTO (`(ingresos − COGS) / ingresos`), que ignora
 * la merma, las cortesías y los reembolsos. Los tres suben cuando sube la
 * venta —se tira más comida, se regala más, se devuelve más— así que dejarlos
 * afuera hace ver el equilibrio MÁS BAJO de lo que es: el dueño cree que ya
 * cubrió los fijos cuando todavía está perdiendo. Con el margen de
 * contribución la cuenta cierra sola: vendiendo exactamente `breakEven`, el
 * resultado neto recurrente da 0.
 *
 * El FLETE de compra entra por la misma razón: es variable (todos los
 * proveedores lo cobran por pedido, ninguno con tarifa fija mensual — decisión
 * del dueño 2026-08-28), así que sube con lo que se compra, que sube con lo que
 * se vende. Dejarlo afuera repetiría el error del margen bruto en otra línea.
 * Si algún día apareciera un flete contratado mensual, ESE va en `totalFixed`.
 *
 * `totalFixed` es la BASE a cubrir, y quien llama decide qué entra. Desde
 * 2026-09-11 (decisión del dueño) el estado financiero pasa fijos + gastos
 * únicos + compromisos pagados: un gasto puntual también hay que pagarlo con
 * las ventas de ese mes, y una meta que lo ignore se lee como si no existiera.
 *
 * Función pura, sin IO.
 */

export interface BreakEvenInput {
  /** Ingresos del período, NETOS de envío (§7.v24: el domicilio no es ingreso). */
  revenue: number;
  /** Costo real (FIFO) de lo vendido. */
  cogs: number;
  /** Merma valorizada del período. */
  wasteCost: number;
  /** Cortesías autorizadas valorizadas del período. */
  cortesiaCost: number;
  /** Costo de la comida de los pedidos reembolsados. */
  refundCost: number;
  /** Faltantes detectados al contar. Variable: escala con el movimiento del
   *  local, igual que la merma, así que pesa en el margen de contribución. */
  shrinkageCost?: number;
  /** Domicilios/fletes que cobraron los proveedores por traer la mercancía en
   *  el período. Variable: escala con las compras. */
  freightCost: number;
  /** Base a cubrir: en el estado financiero, fijos + gastos únicos +
   *  compromisos pagados del mes. */
  totalFixed: number;
}

export interface BreakEvenResult {
  /** Ingresos − COGS − merma − faltantes − cortesías − reembolsos − fletes. */
  contributionMargin: number;
  /** contributionMargin / revenue. null si no hay ingresos. */
  contributionMarginPct: number | null;
  /** Ventas necesarias para cubrir la base. null si el margen de
   *  contribución no es positivo (con margen ≤ 0 no hay volumen que alcance). */
  breakEven: number | null;
  /** revenue / breakEven. >= 1 significa que el mes ya se cubrió. */
  breakEvenCoverage: number | null;
}

export function computeBreakEven(input: BreakEvenInput): BreakEvenResult {
  const contributionMargin =
    input.revenue -
    input.cogs -
    input.wasteCost -
    input.cortesiaCost -
    input.refundCost -
    input.freightCost -
    (input.shrinkageCost ?? 0);
  const contributionMarginPct =
    input.revenue > 0 ? contributionMargin / input.revenue : null;

  // Margen de contribución ≤ 0: cada venta adicional pierde plata, así que NO
  // existe un volumen que cubra los fijos. Devolver un número acá sería mentir
  // (la división por un pct negativo da un "equilibrio" negativo sin sentido).
  if (contributionMarginPct === null || contributionMarginPct <= 0) {
    return { contributionMargin, contributionMarginPct, breakEven: null, breakEvenCoverage: null };
  }

  const breakEven = input.totalFixed / contributionMarginPct;
  return {
    contributionMargin,
    contributionMarginPct,
    breakEven,
    // Sin costos fijos el equilibrio es 0: ya está cubierto por definición, y
    // dividir por 0 daría Infinity.
    breakEvenCoverage: breakEven > 0 ? input.revenue / breakEven : null,
  };
}
