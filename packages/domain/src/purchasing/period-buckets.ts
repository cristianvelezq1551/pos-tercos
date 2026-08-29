/**
 * Agrupa fechas en períodos (semana o mes) para el reporte de compras.
 *
 * Puro y sin IO. Vive en domain porque la respuesta a "¿cuánto gasté en
 * domicilios esta semana?" depende por completo de dónde se corta la semana, y
 * eso es una regla de negocio que tiene que estar testeada, no un detalle de un
 * `GROUP BY`.
 *
 * La semana va de LUNES a domingo (convención ISO, la que espera cualquiera que
 * diga "esta semana"). NO se reusa `payrollWeekFor`: esa semana es de nómina y
 * excluye el lunes de descanso, así que una compra del lunes desaparecería.
 *
 * Todo se calcula en hora LOCAL. Usar UTC correría el borde ~5 h en Bogotá y
 * una compra del domingo a las 19:00 caería en la semana siguiente.
 */

export type BucketGranularity = 'weekly' | 'monthly';

export interface PeriodBucket {
  /** Clave estable y ordenable: `2026-W35` (semana) o `2026-08` (mes). */
  key: string;
  /** Etiqueta para pantalla: `25–31 ago` o `agosto 2026`. */
  label: string;
  /** Primer día del período, YYYY-MM-DD local. */
  from: string;
  /** Último día del período, YYYY-MM-DD local. */
  to: string;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

const DAY_MS = 86_400_000;

/** YYYY-MM-DD del día calendario LOCAL. Nunca `toISOString()`: en Bogotá el
 *  31 a las 23:59 ya es el día 1 en UTC. */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Medianoche local del lunes de la semana de `d`. */
function mondayOf(d: Date): Date {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay(): 0=domingo. El lunes del domingo es 6 días ATRÁS, no 1 adelante.
  const back = (base.getDay() + 6) % 7;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() - back);
}

/**
 * Número de semana ISO. Se usa solo para la CLAVE (ordenar y desempatar), no
 * para decidir el rango: el rango sale de `mondayOf`. La regla ISO es "la
 * semana que contiene el jueves pertenece a ese año", que es lo que evita que
 * el 31 de diciembre caiga en la semana 1 del año que termina.
 */
function isoWeekKey(monday: Date): string {
  const jueves = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3);
  const primeroDeEnero = new Date(jueves.getFullYear(), 0, 1);
  const dias = Math.round((jueves.getTime() - primeroDeEnero.getTime()) / DAY_MS);
  const semana = Math.floor(dias / 7) + 1;
  return `${jueves.getFullYear()}-W${String(semana).padStart(2, '0')}`;
}

/** El período al que pertenece `d`, con su clave, etiqueta y rango de días. */
export function bucketOf(d: Date, granularity: BucketGranularity): PeriodBucket {
  if (granularity === 'monthly') {
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MESES[d.getMonth()]} ${d.getFullYear()}`,
      from: ymd(from),
      to: ymd(to),
    };
  }
  const lunes = mondayOf(d);
  const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
  return {
    key: isoWeekKey(lunes),
    label: etiquetaSemana(lunes, domingo),
    from: ymd(lunes),
    to: ymd(domingo),
  };
}

/**
 * `25–31 ago` cuando la semana no cambia de mes, `28 jul – 3 ago` cuando sí.
 * Repetir el mes en ambos extremos cuando es el mismo hace la etiqueta más
 * larga sin decir nada nuevo, y la tabla se lee peor.
 */
function etiquetaSemana(lunes: Date, domingo: Date): string {
  const mesL = MESES_CORTOS[lunes.getMonth()];
  const mesD = MESES_CORTOS[domingo.getMonth()];
  if (lunes.getMonth() === domingo.getMonth()) {
    return `${lunes.getDate()}–${domingo.getDate()} ${mesD}`;
  }
  return `${lunes.getDate()} ${mesL} – ${domingo.getDate()} ${mesD}`;
}

/**
 * Todos los períodos que tocan `[from, to]`, en orden cronológico — INCLUIDOS
 * los que no tuvieron ninguna compra.
 *
 * Los vacíos importan: una semana sin compras es información (no se pidió
 * nada), y saltearla haría leer la serie como si fueran semanas consecutivas
 * cuando hay un hueco en el medio.
 */
export function bucketsBetween(
  from: Date,
  to: Date,
  granularity: BucketGranularity,
): PeriodBucket[] {
  const out: PeriodBucket[] = [];
  const vistas = new Set<string>();
  // Avanza de a un día: barato para los rangos de esta pantalla (meses, no
  // años) y evita la aritmética de meses de 28/30/31 días.
  let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const fin = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  let guard = 0;
  while (cursor <= fin && guard++ < 4000) {
    const b = bucketOf(cursor, granularity);
    if (!vistas.has(b.key)) {
      vistas.add(b.key);
      out.push(b);
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return out;
}
