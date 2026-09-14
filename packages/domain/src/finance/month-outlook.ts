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

/** Ventas del mes a partir de las cuales el margen BRUTO es medible sobre una
 *  muestra decente. Con menos, se mide sobre cuatro tickets y no representa la
 *  carta; ahí manda el margen teórico (precio contra receta). */
export const MIN_SALES_FOR_MEASURED_MARGIN = 30;

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

/**
 * La META del mes: cuánto hay que vender para no perder plata.
 *
 * DECISIÓN DEL DUEÑO (2026-09-14), y la razón está medida sobre datos reales:
 *
 *   meta = (fijos + únicos + compromisos + PÉRDIDAS del mes) ÷ margen BRUTO
 *
 * Antes se dividía la base entre el margen de CONTRIBUCIÓN (el que ya descuenta
 * merma, faltantes, cortesías y fletes). Suena más completo y es un error:
 * mete montos que YA se gastaron —y que caen de golpe— dentro de una TASA, y
 * esa tasa después divide la base. El resultado se mueve solo.
 *
 * Medido en septiembre de 2026 sobre 10 días, con los costos fijos sin cambiar:
 * la meta iba de $17,1M a $19,6M (**$2,45M de amplitud**), saltaba +$1,2M los
 * días de conteo físico y **bajaba** hasta $718k los días siguientes, no porque
 * el negocio mejorara sino porque más ventas diluyen un monto fijo. Una meta que
 * se ablanda cuando vendes más está mal construida. Con esta fórmula la
 * amplitud cae a $1,5M, el salto máximo a $455k y **nunca baja por dilución**.
 *
 * Por qué el margen BRUTO y no el de la carta: el bruto es una tasa de verdad
 * —el COGS crece con las ventas— y se mide con lo que de verdad se pagó por lo
 * que de verdad se vendió. Medido día a día se movió 63,9 % → 61,4 % sin un
 * solo salto, mientras el de contribución caía a 52,3 % y rebotaba a 55,3 %.
 *
 * ⚠️ Lo que esta meta NO hace: cubrir las pérdidas que todavía no ocurrieron.
 * Solo suma las ya incurridas, así que sube durante el mes (proyectado para
 * septiembre: +$550k a +$820k). Es deliberado — la alternativa era pronosticar
 * merma y faltantes sin historia con qué hacerlo, o sea inventar un número.
 * En todo momento la meta es un PISO, nunca un techo optimista.
 */
export interface MonthTargetInput {
  /** TODO lo que el mes tiene que cubrir con las ventas: los costos fijos
   *  recurrentes, los gastos únicos, los compromisos pagados **y las pérdidas
   *  ya ocurridas** (merma, faltantes, cortesías, reembolsos, fletes). */
  coverBase: number;
  /** Margen BRUTO real del mes: (ingresos − COGS) ÷ ingresos. Es lo que de
   *  verdad deja la comida vendida, con los costos FIFO de los lotes que
   *  salieron. Es una TASA legítima: el COGS crece con las ventas. */
  grossMarginPct: number | null;
  /** Margen de la CARTA (precio contra receta). Respaldo mientras el mes no
   *  tenga ventas suficientes para medir el bruto sobre una muestra decente. */
  catalogMarginPct: number | null;
  salesCount: number;
}
export interface MonthTarget {
  target: number;
  marginPct: number;
  /** Con cuál de los dos márgenes se dividió, para que la pantalla lo diga. */
  basis: 'gross' | 'catalog';
}

export function chooseMonthTarget(input: MonthTargetInput): MonthTarget | null {
  const margen =
    input.grossMarginPct !== null &&
    input.grossMarginPct > 0 &&
    input.salesCount >= MIN_SALES_FOR_MEASURED_MARGIN
      ? { pct: input.grossMarginPct, basis: 'gross' as const }
      : input.catalogMarginPct !== null && input.catalogMarginPct > 0
        ? { pct: input.catalogMarginPct, basis: 'catalog' as const }
        : null;
  if (margen === null) return null;
  return { target: input.coverBase / margen.pct, marginPct: margen.pct, basis: margen.basis };
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
  if (input.salesCount < MIN_SALES_FOR_MEASURED_MARGIN) return null;
  if (revenue <= 0) return null;

  const projectedRevenue = revenue / progress.elapsedFraction;
  return {
    projectedRevenue: Math.round(projectedRevenue),
    projectedNet: Math.round(projectedRevenue * contributionMarginPct - input.breakEvenBase),
  };
}
