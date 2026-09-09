import Link from 'next/link';
import { formatCop } from '@pos-tercos/ui';
import { MARGIN_TONE_CLASS, marginTone } from '../../../lib/margin-thresholds';
import type { ComboComponentCost } from '@pos-tercos/types';

export interface ComboComponentRow extends ComboComponentCost {
  /** Un componente de reventa descuenta su propio stock; el resto, su receta. */
  directResale: boolean | null;
}

/**
 * Un combo NO lleva receta propia: al venderlo se descuenta el stock de cada
 * componente (`computeConsumptionSpecs` recorre `comboComponents`, nunca las
 * líneas de receta del combo). Esta pantalla mostraba el editor vacío con el
 * cartel "sin insumos para descontar al vender 1 unidad", que es falso y hacía
 * pensar que la venta no iba a descontar nada.
 */
export function ComboRecipeView({
  components,
  totalCost,
  missingReasons,
  comboPrice,
}: {
  components: ComboComponentRow[];
  totalCost: number | null;
  missingReasons: string[];
  comboPrice: number;
}) {
  // Un costo de $0 en comida SIEMPRE es dato faltante, no un plato gratis:
  // pintarlo como exacto daría "100% de margen" en verde (misma regla que
  // computeCatalogMargin, que deja fuera al producto sin costo conocido).
  const costoConocido = totalCost !== null && totalCost > 0;
  const margen =
    costoConocido && comboPrice > 0
      ? ((comboPrice - (totalCost as number)) / comboPrice) * 100
      : null;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Este combo no lleva receta propia</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Al vender el combo se descuenta el stock de cada producto que lo compone: los preparados
          descuentan su receta y las bebidas descuentan su propio stock. No hay nada que cargar acá.
          Para cambiar qué trae el combo, edita sus componentes en la{' '}
          <span className="text-foreground">ficha del producto</span>.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Qué descuenta al vender 1 combo</h3>
        {components.length === 0 ? (
          <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Este combo no tiene ningún producto adentro: al venderlo no se descuenta nada del
            inventario. Agrega sus componentes en la ficha del producto.
          </p>
        ) : null}
        <ul className="mt-3 space-y-3">
          {components.map((c) => (
            <li key={c.productId} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-foreground">
                  <span className="tabular">{c.quantity}×</span> {c.productName}
                </span>
                <span className="tabular text-sm text-muted-foreground">
                  {c.costContribution !== null && c.costContribution > 0
                    ? formatCop(c.costContribution)
                    : 'sin costo cargado'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.directResale === null
                  ? 'Componente no encontrado en el catálogo.'
                  : c.directResale
                    ? 'Reventa directa — descuenta su propio stock.'
                    : 'Preparado — descuenta los insumos de su receta.'}
                {c.directResale === false ? (
                  <>
                    {' '}
                    <Link
                      href={`/products/${c.productId}/recipe`}
                      className="font-medium text-primary hover:underline"
                    >
                      Ver su receta
                    </Link>
                  </>
                ) : null}
              </p>
              {c.missingReason ? (
                <p className="mt-1 text-xs text-warning">{c.missingReason}</p>
              ) : null}
            </li>
          ))}
        </ul>

        {components.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border pt-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Costo del combo
            </span>
            <span className="tabular font-display text-xl font-bold text-foreground">
              {costoConocido ? formatCop(totalCost as number) : 'sin costo'}
            </span>
            <span className="tabular text-sm text-muted-foreground">
              sobre {formatCop(comboPrice)} de precio
            </span>
            {margen !== null ? (
              <span
                className={`tabular text-sm font-semibold ${MARGIN_TONE_CLASS[marginTone(margen)]}`}
              >
                {margen.toFixed(1)}% de margen
              </span>
            ) : null}
          </div>
        ) : null}
        {missingReasons.length > 0 ? (
          <p className="mt-2 text-xs text-warning">{missingReasons.join(' · ')}</p>
        ) : !costoConocido && components.length > 0 ? (
          <p className="mt-2 text-xs text-warning">
            Falta cargar el costo de algún componente: revisa que su receta tenga insumos y que esos
            insumos tengan un precio de compra registrado.
          </p>
        ) : null}
      </section>
    </div>
  );
}
