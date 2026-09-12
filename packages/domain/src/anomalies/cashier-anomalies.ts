/**
 * Anomalías por cajero: qué turno se sale de lo NORMAL para esa persona.
 *
 * Dos decisiones de fondo, las dos salidas de mirar datos reales de producción
 * (`AUDITORIA-PROD-2026-09-11.md` §3.6):
 *
 * 1. **Se mide el descuadre TOTAL (cajón + cuenta), no solo el efectivo.** Un
 *    domicilio que el cliente transfirió y el cajero pagó del cajón deja el
 *    efectivo corto y la cuenta sobrada por el MISMO monto: mirando solo el
 *    cajón se ven faltantes de decenas de miles que no faltan. Es el mismo
 *    criterio con el que el cierre le avisa al dueño (§7.v20/§7.v71).
 * 2. **Lo normal se mide con la MEDIANA, no con el promedio.** Un solo turno
 *    con +$228.000 subía el promedio a $35.143 y el umbral a $126.096: con eso
 *    ningún descuadre real podía marcarse nunca. La mediana no se mueve por un
 *    caso suelto, que es justo el que hay que poder ver.
 *
 * Y se evalúan TODOS los turnos de la ventana, no solo el último: un descuadre
 * de hace tres días sigue siendo algo que el dueño tiene que mirar.
 *
 * ⚠️ Esto mide lo ANORMAL para esa persona, no lo que está mal. Un cajero que
 * descuadra $50.000 todos los días tiene eso como norma y no se marca acá —
 * de cada uno de esos cierres ya salió su propia novedad (§7.v20), y la
 * pantalla además cuenta aparte cuántos turnos pasaron el umbral del negocio.
 */

/** Lo que el negocio ya considera descuadre (§7.v20). Piso: por debajo de esto
 *  no se marca nada, aunque el cajero sea tan parejo que su dispersión sea 0. */
export const DISCREPANCY_THRESHOLD_COP = 5_000;

/** Turnos mínimos para tener con qué comparar. Con menos, no hay "normal". */
export const MIN_BASELINE_SAMPLE = 5;

const SIGMAS = 2;
/** Lleva la desviación absoluta mediana a la escala de una σ normal. */
const MAD_TO_SIGMA = 1.4826;
/**
 * Piso para los conteos: el umbral nunca queda por debajo de "lo habitual + 1".
 * Como se marca por ENCIMA del umbral, a un cajero que nunca anula la primera
 * anulación del mes no le salta —es normal y no dice nada— y la segunda sí.
 */
const PISO_DE_CONTEO = 1;

export type ShiftAnomalyFlagKind = 'diff_high' | 'voids_high' | 'noSale_high';

export interface ShiftAnomalySample {
  /** Descuadre total del turno (cajón + cuenta). Null si quedó sin arquear. */
  totalDifference: number | null;
  voidCount: number;
  noSaleCount: number;
}

export interface CashierAnomalyBaseline {
  /** Turnos mirados para medir lo normal. */
  sampleSize: number;
  /** De esos, cuántos tienen el descuadre arqueado. */
  arqueados: number;
  /**
   * Descuadre habitual de esa persona, en valor absoluto. Null cuando no hay
   * suficientes turnos arqueados: ahí no se puede decir qué es normal, y por
   * eso tampoco se marca ningún descuadre.
   */
  typicalDiff: number | null;
  /** Se marca por ENCIMA de este valor. Null por el mismo motivo. */
  thresholdDiff: number | null;
  typicalVoids: number;
  thresholdVoids: number;
  typicalNoSale: number;
  thresholdNoSale: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/** Dispersión robusta: la mediana de qué tan lejos queda cada dato de la mediana. */
function spread(values: readonly number[]): number {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m))) * MAD_TO_SIGMA;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Lo normal para ese cajero. Devuelve null con menos de 5 turnos: inventar un
 * "normal" con dos turnos marcaría cualquier cosa.
 *
 * El descuadre y los conteos se miden por separado a propósito: un turno que
 * cerró con un medio sin arquear no sirve para medir descuadres, pero sus
 * anulaciones y sus aperturas de cajón sí son datos completos. Mezclarlos
 * dejaba a un cajero sin NINGUNA marca solo porque un turno quedó sin arquear.
 */
export function computeCashierBaseline(
  samples: readonly ShiftAnomalySample[],
): CashierAnomalyBaseline | null {
  if (samples.length < MIN_BASELINE_SAMPLE) return null;

  const diffs = samples
    .filter((s) => s.totalDifference !== null)
    .map((s) => Math.abs(s.totalDifference as number));
  const voids = samples.map((s) => s.voidCount);
  const noSale = samples.map((s) => s.noSaleCount);

  const hayDescuadres = diffs.length >= MIN_BASELINE_SAMPLE;
  const typicalDiff = hayDescuadres ? median(diffs) : null;
  const typicalVoids = median(voids);
  const typicalNoSale = median(noSale);

  return {
    sampleSize: samples.length,
    arqueados: diffs.length,
    typicalDiff: typicalDiff === null ? null : round(typicalDiff),
    thresholdDiff:
      typicalDiff === null
        ? null
        : round(Math.max(typicalDiff + SIGMAS * spread(diffs), DISCREPANCY_THRESHOLD_COP)),
    typicalVoids: round(typicalVoids),
    thresholdVoids: round(
      Math.max(typicalVoids + SIGMAS * spread(voids), typicalVoids + PISO_DE_CONTEO),
    ),
    typicalNoSale: round(typicalNoSale),
    thresholdNoSale: round(
      Math.max(typicalNoSale + SIGMAS * spread(noSale), typicalNoSale + PISO_DE_CONTEO),
    ),
  };
}

/**
 * Qué se sale de lo normal en ESE turno. Se marca por ENCIMA del umbral, nunca
 * al ras: si no, un cajero que descuadra siempre lo mismo se marcaría a sí
 * mismo en todos los turnos, que es exactamente lo contrario de "anómalo".
 *
 * Un turno sin arquear no marca por descuadre: no se sabe cuánto fue, y
 * suponerlo en 0 lo daría por bueno.
 */
export function flagsForShift(
  sample: ShiftAnomalySample,
  baseline: CashierAnomalyBaseline,
): ShiftAnomalyFlagKind[] {
  const flags: ShiftAnomalyFlagKind[] = [];
  if (
    baseline.thresholdDiff !== null &&
    sample.totalDifference !== null &&
    Math.abs(sample.totalDifference) > baseline.thresholdDiff
  ) {
    flags.push('diff_high');
  }
  if (sample.voidCount > baseline.thresholdVoids) flags.push('voids_high');
  if (sample.noSaleCount > baseline.thresholdNoSale) flags.push('noSale_high');
  return flags;
}
