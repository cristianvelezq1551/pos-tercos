/**
 * Parser tolerante para extractos CSV de pagos digitales (Nequi /
 * Bancolombia). Los exports reales varían: delimitador (`,` `;` tab), BOM,
 * comillas, orden de columnas, y — el más peligroso — formato de moneda
 * es-CO donde "45.000" son cuarenta y cinco MIL (un Number() ingenuo lee 45
 * y el matching de reconciliación se rompe en silencio).
 *
 * Función pura (sin IO) — testeada en parse-csv.test.ts.
 */

export interface ReconciliationCsvRow {
  date: Date;
  amount: number;
  reference: string;
}

const DATE_ALIASES = ['fecha', 'date', 'fecha transaccion', 'fecha transacción', 'fecha de transaccion'];
const AMOUNT_ALIASES = ['monto', 'valor', 'amount', 'importe', 'valor transaccion', 'valor transacción'];
const REFERENCE_ALIASES = ['referencia', 'ref', 'reference', 'descripcion', 'descripción', 'concepto', 'detalle'];

export function parseReconciliationCsv(text: string): ReconciliationCsvRow[] {
  // BOM de exports de Excel/Windows.
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]!);
  const header = splitCsvLine(lines[0]!, delimiter).map((h) => h.toLowerCase().trim());

  // Mapeo por nombre de columna; si el header no matchea, posicional 0/1/2.
  const dateIdx = findColumn(header, DATE_ALIASES) ?? 0;
  const amountIdx = findColumn(header, AMOUNT_ALIASES) ?? 1;
  const referenceIdx = findColumn(header, REFERENCE_ALIASES) ?? 2;

  const rows: ReconciliationCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!, delimiter);
    if (cols.length < 2) continue;
    const date = parseDateFlexible(cols[dateIdx] ?? '');
    const amount = parseMoneyCo(cols[amountIdx] ?? '');
    const reference = (cols[referenceIdx] ?? '').trim();
    if (date === null || amount === null) continue;
    rows.push({ date, amount, reference });
  }
  return rows;
}

/** El separador que más aparece en el header gana (`,` vs `;` vs tab). */
function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const c of candidates) {
    const count = headerLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

function findColumn(header: string[], aliases: string[]): number | null {
  for (let i = 0; i < header.length; i++) {
    if (aliases.includes(header[i]!)) return i;
  }
  return null;
}

/** Split que respeta comillas dobles ("a, b";c → ['a, b', 'c']). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      // Comilla escapada ("") dentro de un campo entrecomillado.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

/**
 * Moneda en formatos reales colombianos. Reglas:
 *  - "45.000" / "1.234.567" → separador de MILES (45000 / 1234567).
 *  - "45.000,50" → miles con decimal coma (45000.5).
 *  - "45,000.00" → estilo US (45000).
 *  - "45000.5" / "45000" → literal.
 * Heurística: si hay `.` y `,`, el ÚLTIMO separador es el decimal. Si hay
 * uno solo y va seguido de exactamente 3 dígitos → miles; si no → decimal.
 */
export function parseMoneyCo(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned || cleaned === '-' ) return null;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    normalized = cleaned.split(thousandsSep).join('');
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const idx = Math.max(lastDot, lastComma);
    const digitsAfter = cleaned.length - idx - 1;
    const occurrences = cleaned.split(sep).length - 1;
    // Varias apariciones del mismo separador = siempre miles ("1.234.567").
    // Una sola con exactamente 3 dígitos detrás = miles ("45.000").
    if (occurrences > 1 || digitsAfter === 3) {
      normalized = cleaned.split(sep).join('');
    } else {
      normalized = sep === ',' ? cleaned.replace(',', '.') : cleaned;
    }
  } else {
    normalized = cleaned;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** ISO, YYYY-MM-DD o DD/MM/YYYY (con hora opcional). */
export function parseDateFlexible(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  // DD/MM/YYYY (formato de extractos bancarios locales).
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
  if (dmy) {
    const [, d, m, y, hh, mm] = dmy;
    const date = new Date(
      Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0)),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date;
}
