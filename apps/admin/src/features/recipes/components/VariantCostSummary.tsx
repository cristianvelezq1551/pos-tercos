import { formatCop } from '@pos-tercos/ui';
import { MARGIN_TONE_CLASS, marginTone } from '../../../lib/margin-thresholds';

export interface VariantCostRow {
  name: string;
  /** Precio final: base + el recargo de la variante. */
  price: number;
  /** Costo de la receta base MÁS la de esta variante. null si falta un costo. */
  cost: number | null;
}

/**
 * El aviso de que el costo que se ve abajo es SOLO el de la receta base.
 *
 * En un producto con variantes nadie compra la base: elegir variante es
 * obligatorio para vender, así que ese número describe un plato que no existe
 * en la carta. Acá va, al lado, lo que cuesta cada variante de verdad.
 */
export function VariantCostSummary({
  baseCost,
  basePrice,
  variants,
}: {
  baseCost: number | null;
  basePrice: number;
  variants: VariantCostRow[];
}) {
  if (variants.length === 0) return null;
  const margen = (row: VariantCostRow): number | null =>
    row.cost !== null && row.price > 0 ? ((row.price - row.cost) / row.price) * 100 : null;
  const margenBase = baseCost !== null && basePrice > 0 ? ((basePrice - baseCost) / basePrice) * 100 : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Costo de cada variante</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        El costo de la pestaña <strong>Receta base</strong> ({fmt(baseCost)}
        {margenBase !== null ? ` · ${margenBase.toFixed(1)}% de margen` : ''}) es el de un plato
        que nadie puede comprar: elegir variante es obligatorio para vender. Esto es lo que
        cuesta lo que sí sale por la ventana.
      </p>
      <ul className="mt-3 space-y-1.5">
        {variants.map((v) => {
          const m = margen(v);
          return (
            <li key={v.name} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium text-foreground">{v.name}</span>
              <span className="tabular text-muted-foreground">
                {fmt(v.cost)} de costo sobre {formatCop(v.price)}
              </span>
              {m !== null ? (
                <span className={`tabular font-semibold ${MARGIN_TONE_CLASS[marginTone(m)]}`}>
                  {m.toFixed(1)}%
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">sin costo conocido</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const fmt = (n: number | null): string => (n === null ? 'sin costo' : formatCop(n));
