/**
 * Cómo se lee un mes que TODAVÍA NO TERMINÓ.
 *
 * El estado financiero carga los costos del MES COMPLETO —la nómina de los 26
 * días laborables, el arriendo entero— porque eso es lo que el mes va a costar
 * y porque así la meta de ventas no se mueve día a día. Pero los compara contra
 * lo vendido HASTA HOY, y sin decirlo el resultado se lee como una catástrofe:
 * el 13 de septiembre, $9,4M vendidos contra $10,2M de costos del mes entero
 * daban "−$5.047.090" y la frase "el mes cerró en pérdida" sobre un mes que iba
 * por la mitad.
 *
 * Acá viven las tres piezas que faltaban para que eso se entienda: cuánto del
 * mes va corrido, cuál meta mostrar, y en cuánto cierra el mes al ritmo actual.
 */

/** Ventas del mes a partir de las cuales el margen realizado es medible. Con
 *  menos, un solo flete lo mueve decenas de puntos y la meta deja de ser meta. */
export const MIN_SALES_FOR_REALIZED_MARGIN = 30;

/**
 * Días corridos mínimos para proyectar el cierre. Un local hace 30 o 40 tickets
 * en UN día: sin este piso, un sábado bueno proyectaba un mes fantástico y un
 * lunes flojo una catástrofe, con la misma cara de dato.
 */
export const MIN_DAYS_FOR_PROJECTION = 5;

/**
 * Un mes que todavía no empieza NO es un mes cerrado. Sin este tercer estado, el
 * selector de mes dejaba ver noviembre con los costos fijos completos, cero
 * ventas y la frase "el mes cerró en pérdida".
 */
export type PeriodStatus = 'future' | 'in_progress' | 'closed';

export interface PeriodProgress {
  status: PeriodStatus;
  /** Días que dura la ventana del mes de negocio. */
  daysTotal: number;
  /** Días corridos, contando hoy. Igual a `daysTotal` si el mes ya terminó. */
  daysElapsed: number;
  inProgress: boolean;
  /** `daysElapsed / daysTotal`, entre 0 y 1. Es dónde va la marca de "hoy". */
  elapsedFraction: number;
}

const DIA_MS = 86_400_000;
const aUtc = (ymd: string): number => Date.parse(`${ymd}T00:00:00.000Z`);

/**
 * Cuánto del período va corrido. Las tres fechas son YYYY-MM-DD en hora del
 * local: comparar un día contra un instante es lo que corre el mes de lugar
 * (CLAUDE.md §3).
 */
export function periodProgress(
  periodStart: string,
  periodEnd: string,
  today: string,
): PeriodProgress {
  const inicio = aUtc(periodStart);
  const fin = aUtc(periodEnd);
  const hoy = aUtc(today);
  const daysTotal = Math.max(1, Math.round((fin - inicio) / DIA_MS) + 1);

  if (hoy < inicio) {
    return { status: 'future', daysTotal, daysElapsed: 0, inProgress: false, elapsedFraction: 0 };
  }
  // `>` y no `>=`: el último día del mes todavía se vende, y acá se vende de
  // madrugada. Con `>=`, el 30 a las 9 de la mañana el mes ya se declaraba
  // cerrado y desaparecían la marca de hoy y la proyección.
  if (hoy > fin) {
    return { status: 'closed', daysTotal, daysElapsed: daysTotal, inProgress: false, elapsedFraction: 1 };
  }
  const daysElapsed = Math.round((hoy - inicio) / DIA_MS) + 1;
  return {
    status: 'in_progress',
    daysTotal,
    daysElapsed,
    inProgress: true,
    elapsedFraction: daysElapsed / daysTotal,
  };
}

export interface MonthTargetInput {
  /** Meta con el margen REALIZADO del mes (ya descuenta merma, cortesías,
   *  faltantes y fletes). Es la buena cuando hay con qué medirla. */
  realizedTarget: number | null;
  realizedMarginPct: number | null;
  /** Meta con el margen de la CARTA (precio contra receta). Estable desde el
   *  primer día, pero ignora todo lo que se pierde entre la cocina y la caja. */
  catalogTarget: number | null;
  catalogMarginPct: number | null;
  salesCount: number;
}

export interface MonthTarget {
  target: number;
  marginPct: number;
  /** Con cuál de los dos márgenes se calculó, para que la pantalla lo diga. */
  basis: 'realized' | 'catalog';
}

/**
 * Cuál meta mostrar.
 *
 * La realizada es la verdadera: cubrir los costos fijos con lo que de verdad
 * queda de cada venta. La de la carta ignora las fugas y por eso queda baja —
 * vendiendo justo esa meta, el mes cierra en pérdida por el monto de las fugas.
 *
 * Se usa la realizada apenas el mes tiene ventas suficientes para medirla. Antes
 * de eso, la de la carta: un margen calculado sobre tres ventas salta decenas de
 * puntos con un solo flete, y una meta que salta no sirve de meta.
 */
export function chooseMonthTarget(input: MonthTargetInput): MonthTarget | null {
  const hayRealizada =
    input.realizedTarget !== null &&
    input.realizedMarginPct !== null &&
    input.realizedMarginPct > 0 &&
    input.salesCount >= MIN_SALES_FOR_REALIZED_MARGIN;
  if (hayRealizada) {
    return {
      target: input.realizedTarget as number,
      marginPct: input.realizedMarginPct as number,
      basis: 'realized',
    };
  }
  if (
    input.catalogTarget !== null &&
    input.catalogMarginPct !== null &&
    input.catalogMarginPct > 0
  ) {
    return { target: input.catalogTarget, marginPct: input.catalogMarginPct, basis: 'catalog' };
  }
  return null;
}

export interface MonthCloseProjection {
  /** Ventas del mes si se mantiene el ritmo de lo que va corrido. */
  projectedRevenue: number;
  /** Resultado del mes con esas ventas y los costos del mes completo. */
  projectedNet: number;
}

/**
 * En cuánto cierra el mes al ritmo actual. Es el antídoto del resultado en rojo
 * de mitad de mes: dice si ese rojo se va a dar vuelta o no.
 *
 * Proyecta lineal sobre los días corridos. Devuelve null cuando no hay con qué
 * proyectar —mes terminado, sin ritmo, sin margen o con muy pocas ventas—: una
 * proyección hecha con dos días no es una proyección, es un número inventado.
 */
export function projectMonthClose(input: {
  progress: PeriodProgress;
  revenue: number;
  salesCount: number;
  contributionMarginPct: number | null;
  breakEvenBase: number;
}): MonthCloseProjection | null {
  const { progress, revenue, contributionMarginPct } = input;
  if (!progress.inProgress || progress.elapsedFraction <= 0) return null;
  if (progress.daysElapsed < MIN_DAYS_FOR_PROJECTION) return null;
  if (contributionMarginPct === null) return null;
  if (input.salesCount < MIN_SALES_FOR_REALIZED_MARGIN) return null;
  if (revenue <= 0) return null;

  const projectedRevenue = revenue / progress.elapsedFraction;
  return {
    projectedRevenue: Math.round(projectedRevenue),
    projectedNet: Math.round(projectedRevenue * contributionMarginPct - input.breakEvenBase),
  };
}
