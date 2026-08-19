import type { Stockable } from '@pos-tercos/types';

/** Detalle de empaque + unidad de la línea de factura. */
interface LinePack {
  unit: string;
  packUnits?: number | null;
  packSizePerUnit?: number | null;
  packSizeMeasure?: string | null;
}

/** Normaliza una unidad para comparar (singular, gramo→g, mililitro→ml). */
function normUnit(u: string): string {
  return u
    .trim()
    .toLowerCase()
    .replace(/s$/, '')
    .replace('gramo', 'g')
    .replace('mililitro', 'ml')
    .replace('litro', 'lt');
}

export function unitsMatch(a: string, b: string): boolean {
  const na = normUnit(a);
  const nb = normUnit(b);
  return na === nb || na.startsWith(nb) || nb.startsWith(na);
}

/**
 * Factor de conversión SUGERIDO a la unidad base del stockable: cuántas
 * unidades base hay en 1 unidad de la línea de factura. Es solo una sugerencia
 * — el operador la verifica/edita en el panel (ahí está la garantía de FIFO
 * exacto). Prioriza el desglose de empaque detectado por la IA.
 */
export function suggestBaseFactor(stockable: Stockable, line: LinePack): number {
  const base = stockable.unitStock || 'unidad';
  if (line.packUnits && line.packUnits > 0) {
    // "150 g X 10 U": si la medida del empaque coincide con la base → 10×150;
    // si la base son unidades sueltas → 10.
    if (line.packSizePerUnit && line.packSizeMeasure && unitsMatch(base, line.packSizeMeasure)) {
      return line.packUnits * line.packSizePerUnit;
    }
    return line.packUnits;
  }
  if (unitsMatch(line.unit, base)) return 1;
  return stockable.conversionFactor && stockable.conversionFactor > 0 ? stockable.conversionFactor : 1;
}

/**
 * ¿La conversión que se va a confirmar es sospechosa?
 *
 * Cuando la factura viene en la MISMA unidad en que se compra el insumo
 * (dice "kg" y el insumo se compra en "kg"), el factor tiene que ser el del
 * insumo: 1 kg = 1.000 g. Cualquier otro número está mal, y el daño es
 * silencioso: entra menos mercancía de la que llegó Y el costo del insumo
 * queda disparado, que después se propaga al costo de cada plato.
 *
 * Caso real: 1 kg de queso confirmado con factor 40 → entraron 40 g en vez de
 * 1.000, y el kilo quedó costando $750.000 habiendo pagado $30.000.
 */
export function conversionSospechosa(opts: {
  lineUnit: string;
  unitPurchase: string;
  conversionFactor: number;
  factorElegido: number;
}): boolean {
  if (!opts.lineUnit || !opts.unitPurchase) return false;
  if (!(opts.conversionFactor > 0)) return false;
  if (!unitsMatch(opts.lineUnit, opts.unitPurchase)) return false;
  return Math.abs(opts.factorElegido - opts.conversionFactor) > 1e-9;
}
