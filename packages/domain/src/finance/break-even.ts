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
 * Los gastos PUNTUALES (una reparación, un horno nuevo) quedan fuera a
 * propósito: no se repiten, así que no definen el piso de operación del mes
 * siguiente. Se restan del neto, no del equilibrio.
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
  /** Costos fijos RECURRENTES (nómina + mensuales/anuales). Sin puntuales. */
  totalFixed: number;
}

export interface BreakEvenResult {
  /** Ingresos − COGS − merma − cortesías − reembolsos. */
  contributionMargin: number;
  /** contributionMargin / revenue. null si no hay ingresos. */
  contributionMarginPct: number | null;
  /** Ventas necesarias para cubrir los fijos recurrentes. null si el margen de
   *  contribución no es positivo (con margen ≤ 0 no hay volumen que alcance). */
  breakEven: number | null;
  /** revenue / breakEven. >= 1 significa que el mes ya se cubrió. */
  breakEvenCoverage: number | null;
}

export function computeBreakEven(input: BreakEvenInput): BreakEvenResult {
  const contributionMargin =
    input.revenue - input.cogs - input.wasteCost - input.cortesiaCost - input.refundCost;
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
