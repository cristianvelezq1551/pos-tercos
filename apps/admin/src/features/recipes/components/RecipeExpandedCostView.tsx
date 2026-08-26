import type { ExpandedCostResponse, FifoLotsResponse } from '@pos-tercos/types';
import { formatCop, pluralizeUnit } from '@pos-tercos/ui';
import { FifoYieldBreakdown } from './FifoYieldBreakdown';
import { Th, Td, formatRecipeNumber } from './RecipeTablePrimitives';

interface RecipeExpandedCostViewProps {
  cost: ExpandedCostResponse | null;
  error: string | null;
  isDirty: boolean;
  fifoLots?: FifoLotsResponse | null;
}

// Un costo más viejo que esto se marca como potencialmente desactualizado.
const STALE_DAYS = 60;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
function isStale(iso: string | null): boolean {
  const d = daysSince(iso);
  return d !== null && d >= STALE_DAYS;
}
function staleTitle(iso: string | null): string {
  const d = daysSince(iso);
  return d === null
    ? 'Sin fecha de costo registrada'
    : `Último costo hace ${d} días — puede estar desactualizado`;
}

export function RecipeExpandedCostView({
  cost,
  error,
  isDirty,
  fifoLots,
}: RecipeExpandedCostViewProps) {
  if (isDirty) {
    return (
      <section className="rounded-lg border border-warning-border bg-warning-bg/30 p-4">
        <p className="text-sm text-warning">
          Hay cambios sin guardar. Guarda la receta para recalcular el costo y el desglose de
          insumos.
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">No se pudo calcular el desglose: {error}</p>
      </section>
    );
  }

  if (!cost) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Calculando desglose…</p>
      </section>
    );
  }

  if (cost.totals.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          La receta está vacía — sin insumos para descontar al vender 1 unidad.
        </p>
      </section>
    );
  }

  const hasStale = cost.totals.some(
    (t) => t.unitCostInRecipe !== null && isStale(t.lastUnitCostDate),
  );

  return (
    <section className="space-y-3">
      {/* Resumen de costo: el dato ya viene del backend; antes se descartaba. */}
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Costo estimado por unidad
        </p>
        {cost.totalCost !== null ? (
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">
            {formatCop(cost.totalCost)}
          </p>
        ) : (
          <div className="mt-1.5">
            <p className="text-sm font-medium text-warning">
              Todavía no se puede calcular el costo:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {cost.missingReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Es un <strong>estimado</strong>: usa el <strong>último costo de compra</strong> de cada
          insumo (no un promedio) y cambia cuando confirmas una factura con un precio distinto.
          <br />
          El costo <strong>real</strong> de lo que ya vendiste puede ser otro y lo ves en{' '}
          <strong>Reportes → Costos</strong>: ahí se calcula por FIFO, gastando primero el lote más
          viejo. Si compraste el mismo insumo a dos precios, lo vendido sale al precio del lote que
          se consumió, no al último que pagaste.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Desglose de insumos por unidad vendida
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cantidad bruta a descontar de cada insumo cuando se vende 1 unidad de este producto,
          considerando merma y rendimiento de subproductos transitivamente.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <Th>Insumo</Th>
                <Th align="right">Cantidad</Th>
                <Th>Unidad</Th>
                <Th align="right">Costo unit.</Th>
                <Th align="right">Costo</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cost.totals.map((t) => (
                <tr key={t.ingredientId} className="hover:bg-muted/40">
                  <Td>
                    <span className="font-medium text-foreground">{t.name}</span>
                  </Td>
                  <Td align="right" mono>
                    {formatRecipeNumber(t.totalQuantity)}
                  </Td>
                  <Td>{pluralizeUnit(t.unitRecipe, t.totalQuantity)}</Td>
                  <Td align="right" mono>
                    {t.unitCostInRecipe !== null ? (
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {isStale(t.lastUnitCostDate) && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                            title={staleTitle(t.lastUnitCostDate)}
                            aria-label={staleTitle(t.lastUnitCostDate)}
                          />
                        )}
                        {formatCop(t.unitCostInRecipe)}
                      </span>
                    ) : (
                      <span className="text-warning">sin costo</span>
                    )}
                  </Td>
                  <Td align="right" mono>
                    {t.costContribution !== null ? (
                      <span className="font-medium text-foreground">
                        {formatCop(t.costContribution)}
                      </span>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {hasStale && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
          Algunos insumos no se compran hace más de {STALE_DAYS} días: su costo (y el margen) pueden
          estar desactualizados.
        </p>
      )}

      <FifoYieldBreakdown directComponents={cost.directComponents} fifoLots={fifoLots ?? null} />
    </section>
  );
}
