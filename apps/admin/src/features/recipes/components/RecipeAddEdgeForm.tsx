import { Button, Input, Label } from '@pos-tercos/ui';
import type { Ingredient, Subproduct } from '@pos-tercos/types';

interface RecipeAddEdgeFormProps {
  addType: 'ingredient' | 'subproduct';
  addChildId: string;
  addQty: string;
  addMermaPercent: string;
  ingredients: Ingredient[];
  subproductsAvailable: Subproduct[];
  onChangeType: (t: 'ingredient' | 'subproduct') => void;
  onChangeChild: (id: string) => void;
  onChangeQty: (q: string) => void;
  onChangeMerma: (m: string) => void;
  onAdd: () => void;
  disabled: boolean;
}

export function RecipeAddEdgeForm({
  addType,
  addChildId,
  addQty,
  addMermaPercent,
  ingredients,
  subproductsAvailable,
  onChangeType,
  onChangeChild,
  onChangeQty,
  onChangeMerma,
  onAdd,
  disabled,
}: RecipeAddEdgeFormProps) {
  const options = addType === 'ingredient' ? ingredients : subproductsAvailable;
  return (
    <fieldset className="space-y-3 rounded-lg border border-border bg-card p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Agregar item a la receta
      </legend>

      <div className="flex gap-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="addType"
            checked={addType === 'ingredient'}
            onChange={() => {
              onChangeType('ingredient');
              onChangeChild('');
            }}
            disabled={disabled}
            className="h-4 w-4 text-primary focus:ring-ring"
          />
          Insumo
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="addType"
            checked={addType === 'subproduct'}
            onChange={() => {
              onChangeType('subproduct');
              onChangeChild('');
            }}
            disabled={disabled}
            className="h-4 w-4 text-primary focus:ring-ring"
          />
          Subproducto
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="addChild">{addType === 'ingredient' ? 'Insumo' : 'Subproducto'}</Label>
          <select
            id="addChild"
            value={addChildId}
            onChange={(e) => onChangeChild(e.target.value)}
            disabled={disabled}
            className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <option value="">— Seleccionar —</option>
            {options.map((o) => {
              const unit = 'unitRecipe' in o ? o.unitRecipe : o.unit;
              return (
                <option key={o.id} value={o.id}>
                  {o.name} ({unit})
                </option>
              );
            })}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="addQty">Cant. neta</Label>
          <Input
            id="addQty"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            disabled={disabled}
            value={addQty}
            onChange={(e) => onChangeQty(e.target.value)}
            placeholder="180"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="addMerma">Merma %</Label>
          <Input
            id="addMerma"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            max="99.99"
            disabled={disabled}
            value={addMermaPercent}
            onChange={(e) => onChangeMerma(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="flex items-end">
          <Button type="button" size="sm" onClick={onAdd} disabled={disabled}>
            + Agregar
          </Button>
        </div>
      </div>
    </fieldset>
  );
}
