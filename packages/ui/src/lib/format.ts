/**
 * Formatters canónicos para POS Tercos. Single source of truth — NO duplicar
 * en cada app. Usa estos helpers en cualquier lugar que renderice plata,
 * números, fechas u horas.
 */

import { BUSINESS_TIME_ZONE } from '@pos-tercos/types';

export { BUSINESS_TIME_ZONE };

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const COP_NO_SYMBOL = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const NUM_FRACTION = (decimals: number) =>
  new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });

/**
 * Formatea pesos colombianos. Acepta number o string (parsea).
 * `withSymbol = false` omite "$" — útil cuando el contexto ya lo deja claro.
 */
export function formatCop(
  amount: number | string | null | undefined,
  opts?: { withSymbol?: boolean },
): string {
  if (amount == null || amount === '') return '—';
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) return '—';
  const fmt = opts?.withSymbol === false ? COP_NO_SYMBOL : COP;
  return fmt.format(n);
}

/**
 * Descarta todo lo que no sea dígito. Útil para inputs de plata (COP es entero)
 * donde el usuario ve separadores de miles pero el estado guarda solo dígitos.
 */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Agrupa una cadena de dígitos con puntos de miles: "100000" → "100.000".
 * Recorta ceros a la izquierda. Cadena vacía → "".
 */
export function groupDigits(value: string): string {
  const clean = onlyDigits(value).replace(/^0+(?=\d)/, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Formatea un número en es-CO.
 * - `decimals`: cantidad FIJA de decimales (siempre los muestra, aunque sean ceros).
 * - `maxDecimals`: HASTA esa cantidad, recortando ceros al final.
 *   Ej. `maxDecimals: 4` → 1000 → "1.000", 1.5 → "1,5", 0.001 → "0,001".
 * Si no se pasa nada, entero (0 decimales).
 */
export function formatNumber(
  value: number | null | undefined,
  opts?: { decimals?: number; maxDecimals?: number },
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (opts?.maxDecimals !== undefined) {
    return new Intl.NumberFormat('es-CO', {
      maximumFractionDigits: opts.maxDecimals,
      minimumFractionDigits: 0,
    }).format(value);
  }
  return NUM_FRACTION(opts?.decimals ?? 0).format(value);
}

/**
 * Formatea porcentaje. `value` ya en % (no en 0–1). Ej: formatPercent(15.6) → "15,6 %".
 */
export function formatPercent(
  value: number | null | undefined,
  opts?: { decimals?: number; withSign?: boolean },
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = opts?.withSign && value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, { decimals: opts?.decimals ?? 1 })} %`;
}

/**
 * Unidades que SÍ sabemos pluralizar: palabras españolas de conteo, con su
 * plural escrito a mano (los acentos y las erres finales no salen de una regla).
 */
const KNOWN_PLURALS: Record<string, string> = {
  unidad: 'unidades',
  porción: 'porciones',
  porcion: 'porciones',
  ración: 'raciones',
  racion: 'raciones',
  taza: 'tazas',
  vaso: 'vasos',
  plato: 'platos',
  cucharada: 'cucharadas',
  cucharadita: 'cucharaditas',
  gramo: 'gramos',
  kilo: 'kilos',
  kilogramo: 'kilogramos',
  litro: 'litros',
  mililitro: 'mililitros',
  libra: 'libras',
  onza: 'onzas',
  arroba: 'arrobas',
  paquete: 'paquetes',
  bolsa: 'bolsas',
  caja: 'cajas',
  canasta: 'canastas',
  cubeta: 'cubetas',
  bandeja: 'bandejas',
  botella: 'botellas',
  frasco: 'frascos',
  tarro: 'tarros',
  lata: 'latas',
  sobre: 'sobres',
  rollo: 'rollos',
  barra: 'barras',
  pieza: 'piezas',
  tira: 'tiras',
  hoja: 'hojas',
  docena: 'docenas',
  bulto: 'bultos',
  galón: 'galones',
  galon: 'galones',
  tanda: 'tandas',
  unidades: 'unidades',
};

const NUMERIC_UNIT = /^\d+(?:[.,]\d+)?$/;

/**
 * Pluraliza una unidad de conteo según la cantidad (es-CO).
 *
 * REGLA: solo se pluraliza lo que RECONOCEMOS. Cualquier otra cosa se muestra
 * tal como la escribió el dueño.
 *
 * Antes había una regla que adivinaba el plural de cualquier palabra ("le pego
 * -es si termina en consonante"), y con las abreviaturas que la gente escribe
 * de verdad producía disparates: "gr" salía como **"gres"**, "und" como
 * "undes". Ese texto aparece en la receta, en la producción y en el conteo —
 * o sea, justo donde alguien está midiendo. Inventarle una letra a la unidad
 * que el dueño definió es peor que dejarla en singular.
 *
 * Una unidad vacía o numérica ("1", "2" — dato heredado sucio) se trata como
 * "unidad": nunca dejamos que un número se muestre como unidad.
 */
export function pluralizeUnit(unit: string | null | undefined, quantity: number): string {
  const u = (unit ?? '').trim();
  const singular = Math.abs(quantity) === 1;
  if (u === '' || NUMERIC_UNIT.test(u)) return singular ? 'unidad' : 'unidades';
  if (singular) return u;
  return KNOWN_PLURALS[u.toLowerCase()] ?? u;
}

export type DateFormat =
  | 'short'
  | 'long'
  | 'datetime'
  | 'datetime-compact'
  | 'time'
  | 'time-short'
  | 'relative';

/**
 * Formatea fechas. Acepta Date o string ISO.
 *
 * - `short`: 04 may 2026
 * - `long`: lunes 04 de mayo 2026
 * - `datetime`: 04 may 2026 14:32
 * - `datetime-compact`: 04 may, 14:32 — sin año, para que quepa en una línea
 *   en pantalla de teléfono. El año lo da el contexto de la pantalla.
 * - `time`: 14:32:18
 * - `time-short`: 14:32
 * - `relative`: "hace 5 min" / "en 2 h"
 */
export function formatDate(
  value: Date | string | null | undefined,
  format: DateFormat = 'short',
): string {
  if (value == null) return '—';
  // Una fecha-solo `YYYY-MM-DD` la parsea JS como medianoche UTC; al mostrarla
  // en Bogotá (UTC-5) esa medianoche es todavía el día anterior a las 7 pm, y
  // "2026-06-24" se leería 23. La anclamos al MEDIODÍA UTC: cae en el mismo día
  // calendario en cualquier zona entre UTC-11 y UTC+11, así que el 24 se ve 24.
  const d =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? (() => {
            const [y, m, day] = value.split('-').map(Number);
            return new Date(Date.UTC(y, m - 1, day, 12));
          })()
        : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';

  switch (format) {
    case 'short':
      return new Intl.DateTimeFormat('es-CO', {
        timeZone: BUSINESS_TIME_ZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(d);
    case 'long':
      return new Intl.DateTimeFormat('es-CO', {
        timeZone: BUSINESS_TIME_ZONE,
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(d);
    case 'datetime':
      return new Intl.DateTimeFormat('es-CO', {
        timeZone: BUSINESS_TIME_ZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    case 'datetime-compact': {
      // Armado por partes a propósito: el patrón de es-CO intercala "de"
      // ("2 de sept, 16:05") y en un teléfono cada carácter cuenta — el
      // objetivo es que la fecha quepa en UNA línea al lado de su etiqueta.
      const parts = new Intl.DateTimeFormat('es-CO', {
        timeZone: BUSINESS_TIME_ZONE,
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const get = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find((x) => x.type === type)?.value ?? '';
      const mes = get('month').replace(/\.$/, '');
      // `day: '2-digit'` no garantiza el cero a la izquierda en es-CO cuando se
      // pide por partes; se fuerza para que la columna quede alineada.
      const dia = get('day').padStart(2, '0');
      return `${dia} ${mes}, ${get('hour')}:${get('minute')}`;
    }
    case 'time':
      return new Intl.DateTimeFormat('es-CO', {
        timeZone: BUSINESS_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(d);
    case 'time-short':
      return new Intl.DateTimeFormat('es-CO', {
        timeZone: BUSINESS_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    case 'relative':
      return formatRelative(d);
  }
}

const RELATIVE = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' });

function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);
  if (absSec < 60) return RELATIVE.format(diffSec, 'second');
  if (absSec < 3600) return RELATIVE.format(Math.round(diffSec / 60), 'minute');
  if (absSec < 86400) return RELATIVE.format(Math.round(diffSec / 3600), 'hour');
  if (absSec < 86400 * 30) return RELATIVE.format(Math.round(diffSec / 86400), 'day');
  if (absSec < 86400 * 365) return RELATIVE.format(Math.round(diffSec / (86400 * 30)), 'month');
  return RELATIVE.format(Math.round(diffSec / (86400 * 365)), 'year');
}

/**
 * Formatea milisegundos como "mm:ss" (cronómetro corto) o "h:mm:ss" si > 1h.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
