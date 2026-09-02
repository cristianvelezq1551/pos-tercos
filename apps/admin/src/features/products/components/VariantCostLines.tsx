import type { ProductVariantCost } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';
import { MARGIN_TONE_CLASS, marginTone } from '../../../lib/margin-thresholds';

/**
 * Lo que cuesta y deja el plato CON variante, debajo del número de la base.
 *
 * En un producto con variantes el costo de la receta base describe algo que no
 * se puede comprar: elegir variante es obligatorio para vender. La base se
 * conserva (es la que usan los reportes) y al lado va lo que de verdad sale por
 * la ventana, que es más caro y deja menos.
 */

export interface VarianteCosteada {
  name: string;
  /** Precio final de esa variante: base + su recargo. */
  price: number;
  cost: number;
  /** Margen en porcentaje (0..100). null si el precio no permite calcularlo. */
  marginPct: number | null;
}

/**
 * Solo las variantes que cuestan distinto de la base: si ninguna tiene receta
 * propia, repetir el mismo número debajo es ruido.
 */
export function variantesCosteadas(
  variants: ProductVariantCost[] | undefined,
  basePrice: number,
  baseCost: number | null,
): VariantesResumen | null {
  if (!variants?.length) return null;
  const conCosto = variants.filter((v) => v.totalCost !== null);
  if (conCosto.length === 0) return null;
  const difieren = conCosto.some(
    (v) => baseCost === null || Math.abs((v.totalCost as number) - baseCost) > 0.01,
  );
  if (!difieren) return null;

  const items: VarianteCosteada[] = conCosto.map((v) => {
    const price = basePrice + v.priceModifier;
    const cost = v.totalCost as number;
    return {
      name: v.name,
      price,
      cost,
      marginPct: price > 0 ? ((price - cost) / price) * 100 : null,
    };
  });
  return { items, sinCosto: variants.length - conCosto.length };
}

export interface VariantesResumen {
  items: VarianteCosteada[];
  /** Variantes que no se pudieron costear: se avisan, no se dan por $0. */
  sinCosto: number;
}

const detalle = (r: VariantesResumen): string =>
  [
    ...r.items.map(
      (v) =>
        `${v.name}: ${formatCop(v.cost)} de costo sobre ${formatCop(v.price)}` +
        (v.marginPct !== null ? ` · ${v.marginPct.toFixed(1)}% de margen` : ''),
    ),
    ...(r.sinCosto > 0 ? [`${r.sinCosto} variante(s) sin costo conocido`] : []),
  ].join('\n');

/** Rango de costo de las variantes, debajo del costo de la base. */
export function VariantCostLine({ resumen }: { resumen: VariantesResumen }) {
  const costos = resumen.items.map((v) => v.cost);
  return (
    <span
      className="mt-0.5 block text-[11px] font-normal text-muted-foreground"
      title={detalle(resumen)}
    >
      con variante {rango(costos, formatCop)}
    </span>
  );
}

/** Rango de margen de las variantes, debajo del margen de la base. */
export function VariantMarginLine({ resumen }: { resumen: VariantesResumen }) {
  const margenes = resumen.items
    .map((v) => v.marginPct)
    .filter((m): m is number => m !== null);
  if (margenes.length === 0) return null;
  const peor = Math.min(...margenes);
  const tone = MARGIN_TONE_CLASS[marginTone(peor)];
  return (
    <span className="mt-0.5 block text-[11px] font-normal" title={detalle(resumen)}>
      <span className="text-muted-foreground">con variante </span>
      <span className={tone}>{rango(margenes, (n) => `${n.toFixed(1)}%`)}</span>
    </span>
  );
}

/** "$3.108 – $4.108", o un solo valor cuando todas coinciden. */
function rango(valores: number[], formato: (n: number) => string): string {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  return Math.abs(max - min) < 0.01 ? formato(min) : `${formato(min)} – ${formato(max)}`;
}
