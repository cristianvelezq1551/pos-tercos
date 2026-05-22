import type { ExpandedCostResponse } from '@pos-tercos/types';
import { Th, Td, formatRecipeNumber } from './RecipeTablePrimitives';

interface RecipeExpandedCostViewProps {
  cost: ExpandedCostResponse | null;
  error: string | null;
  isDirty: boolean;
}

export function RecipeExpandedCostView({ cost, error, isDirty }: RecipeExpandedCostViewProps) {
  if (isDirty) {
    return (
      <section className="rounded-lg border border-warning-border bg-warning-bg/30 p-4">
        <p className="text-sm text-warning">
          Hay cambios sin guardar. Guarda la receta para recalcular el desglose de insumos.
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

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Desglose de insumos por unidad vendida
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cantidad bruta a descontar de cada insumo cuando se vende 1 unidad de este producto,
          considerando merma y yield de subproductos transitivamente.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40">
            <tr>
              <Th>Insumo</Th>
              <Th align="right">Cantidad total</Th>
              <Th>Unidad</Th>
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
                <Td>{t.unitRecipe}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
