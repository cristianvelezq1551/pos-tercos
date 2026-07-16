import type { Ingredient, Subproduct } from '@pos-tercos/types';
import { pluralizeUnit } from '@pos-tercos/ui';
import { Th, Td, TypeBadge, formatRecipeNumber } from './RecipeTablePrimitives';

export interface DraftEdge {
  childType: 'ingredient' | 'subproduct';
  childId: string;
  quantityNeta: number;
  /** stored as fraction in [0,1) (eg 0.05 = 5%) */
  mermaPct: number;
  /** Override por receta de si frena la venta. null = hereda del insumo. */
  blocksAvailability: boolean | null;
}

interface RecipeDraftTableProps {
  draft: DraftEdge[];
  ingredientById: Map<string, Ingredient>;
  subproductById: Map<string, Subproduct>;
  onRemove: (index: number) => void;
  onChangeBlocks: (index: number, value: boolean | null) => void;
}

export function RecipeDraftTable({
  draft,
  ingredientById,
  subproductById,
  onRemove,
  onChangeBlocks,
}: RecipeDraftTableProps) {
  if (draft.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center">
        <p className="text-sm font-medium text-foreground">La receta está vacía.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Agrega insumos o subproductos abajo para empezar.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th>Tipo</Th>
            <Th>Item</Th>
            <Th align="right">Cantidad neta</Th>
            <Th>Unidad</Th>
            <Th align="right">Merma</Th>
            <Th align="right">Se descuenta</Th>
            <Th>¿Frena la venta?</Th>
            <Th align="right">Acción</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {draft.map((edge, index) => {
            const ing = edge.childType === 'ingredient' ? ingredientById.get(edge.childId) : null;
            const sub =
              edge.childType === 'subproduct' ? subproductById.get(edge.childId) : null;
            const name = ing?.name ?? sub?.name ?? '(item eliminado)';
            const unit = ing?.unitRecipe ?? sub?.unit ?? '?';
            const gross = edge.mermaPct < 1 ? edge.quantityNeta / (1 - edge.mermaPct) : 0;
            // Lo que haría el flag del insumo/subproducto si esta línea hereda.
            const inheritedBlocks = (ing ?? sub)?.blocksAvailability ?? true;
            return (
              <tr
                key={`${edge.childType}-${edge.childId}-${index}`}
                className="hover:bg-muted/40"
              >
                <Td>
                  <TypeBadge tone={edge.childType === 'ingredient' ? 'ingredient' : 'subproduct'}>
                    {edge.childType === 'ingredient' ? 'Insumo' : 'Subproducto'}
                  </TypeBadge>
                </Td>
                <Td>
                  <span className="font-medium text-foreground">{name}</span>
                </Td>
                <Td align="right" mono>
                  {formatRecipeNumber(edge.quantityNeta)}
                </Td>
                <Td>{unit === '?' ? unit : pluralizeUnit(unit, edge.quantityNeta)}</Td>
                <Td align="right" mono>
                  {(edge.mermaPct * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })}%
                </Td>
                <Td align="right" mono>
                  {formatRecipeNumber(gross)}
                </Td>
                <Td>
                  <select
                    value={
                      edge.blocksAvailability === null ? 'inherit' : String(edge.blocksAvailability)
                    }
                    onChange={(e) =>
                      onChangeBlocks(
                        index,
                        e.target.value === 'inherit' ? null : e.target.value === 'true',
                      )
                    }
                    aria-label={`¿${name} frena la venta?`}
                    className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="inherit">
                      Hereda ({inheritedBlocks ? 'frena' : 'no frena'})
                    </option>
                    <option value="true">Sí, frena</option>
                    <option value="false">No frena</option>
                  </select>
                </Td>
                <Td align="right">
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="font-medium text-destructive hover:underline"
                  >
                    Quitar
                  </button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
