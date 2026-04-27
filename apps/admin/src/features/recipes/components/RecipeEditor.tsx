'use client';

import { Button, Input, Label } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import type {
  ExpandedCostResponse,
  Ingredient,
  RecipeEdgeInput,
  RecipeResponse,
  Subproduct,
} from '@pos-tercos/types';
import {
  getExpandedCost,
  setProductRecipe,
  setSubproductRecipe,
} from '../api/client';

interface RecipeEditorProps {
  parentType: 'product' | 'subproduct';
  parentId: string;
  parentName: string;
  initialRecipe: RecipeResponse;
  ingredients: Ingredient[];
  subproducts: Subproduct[];
  showExpandedCost?: boolean;
}

interface DraftEdge {
  childType: 'ingredient' | 'subproduct';
  childId: string;
  quantityNeta: number;
  /** stored as fraction in [0,1) (eg 0.05 = 5%) */
  mermaPct: number;
}

function recipeToDraft(recipe: RecipeResponse): DraftEdge[] {
  return recipe.edges.map((e) => ({
    childType: e.childIngredientId !== null ? 'ingredient' : 'subproduct',
    childId: (e.childIngredientId ?? e.childSubproductId) as string,
    quantityNeta: e.quantityNeta,
    mermaPct: e.mermaPct,
  }));
}

export function RecipeEditor({
  parentType,
  parentId,
  parentName,
  initialRecipe,
  ingredients,
  subproducts,
  showExpandedCost = false,
}: RecipeEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<DraftEdge[]>(() => recipeToDraft(initialRecipe));
  const [savedSnapshot, setSavedSnapshot] = useState<DraftEdge[]>(() =>
    recipeToDraft(initialRecipe),
  );
  const [error, setError] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<'idle' | 'saving'>('idle');
  const [expandedCost, setExpandedCost] = useState<ExpandedCostResponse | null>(null);
  const [expandedCostError, setExpandedCostError] = useState<string | null>(null);

  // Add-row form
  const [addType, setAddType] = useState<'ingredient' | 'subproduct'>('ingredient');
  const [addChildId, setAddChildId] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addMermaPercent, setAddMermaPercent] = useState('0');

  const ingredientById = useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients],
  );
  const subproductById = useMemo(
    () => new Map(subproducts.map((s) => [s.id, s])),
    [subproducts],
  );

  const isDirty = !sameEdges(draft, savedSnapshot);

  // Filter subproduct picker to exclude self-cycle option
  const subproductsAvailable = useMemo(() => {
    if (parentType !== 'subproduct') return subproducts;
    return subproducts.filter((s) => s.id !== parentId);
  }, [parentType, parentId, subproducts]);

  // Fetch expanded cost when applicable and recipe is saved (not dirty)
  useEffect(() => {
    if (!showExpandedCost || isDirty) return;
    let cancelled = false;
    getExpandedCost(parentId)
      .then((res) => {
        if (!cancelled) {
          setExpandedCost(res);
          setExpandedCostError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setExpandedCost(null);
          setExpandedCostError(err instanceof Error ? err.message : 'Error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showExpandedCost, isDirty, parentId, savedSnapshot]);

  const childAlreadyInDraft = (type: 'ingredient' | 'subproduct', id: string): boolean =>
    draft.some((d) => d.childType === type && d.childId === id);

  const handleAddRow = () => {
    setError(null);

    if (!addChildId) {
      setError('Elegí un insumo o subproducto.');
      return;
    }
    if (childAlreadyInDraft(addType, addChildId)) {
      setError('Ese item ya está en la receta. Editá la cantidad existente.');
      return;
    }

    const qty = Number(addQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('La cantidad debe ser un número positivo.');
      return;
    }

    const mermaPercent = Number(addMermaPercent);
    if (!Number.isFinite(mermaPercent) || mermaPercent < 0 || mermaPercent >= 100) {
      setError('La merma debe ser un porcentaje entre 0 y menos de 100.');
      return;
    }

    setDraft((d) => [
      ...d,
      {
        childType: addType,
        childId: addChildId,
        quantityNeta: qty,
        mermaPct: mermaPercent / 100,
      },
    ]);
    setAddChildId('');
    setAddQty('');
    setAddMermaPercent('0');
  };

  const handleRemoveRow = (index: number) => {
    setDraft((d) => d.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setError(null);
    setSavingState('saving');
    const edges: RecipeEdgeInput[] = draft.map((d) =>
      d.childType === 'ingredient'
        ? {
            childType: 'ingredient',
            childId: d.childId,
            quantityNeta: d.quantityNeta,
            mermaPct: d.mermaPct,
          }
        : {
            childType: 'subproduct',
            childId: d.childId,
            quantityNeta: d.quantityNeta,
            mermaPct: d.mermaPct,
          },
    );

    try {
      const updated =
        parentType === 'product'
          ? await setProductRecipe(parentId, edges)
          : await setSubproductRecipe(parentId, edges);
      const next = recipeToDraft(updated);
      setDraft(next);
      setSavedSnapshot(next);
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSavingState('idle');
    }
  };

  const handleDiscard = () => {
    setDraft(savedSnapshot);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
          Receta · {parentType === 'product' ? 'Producto' : 'Subproducto'}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{parentName}</h1>
        <p className="mt-1 text-sm text-gray-600">
          Define qué insumos o subproductos consume {parentType === 'product' ? 'el producto' : 'el subproducto'}.
          La merma se aplica como pérdida proporcional: la cantidad bruta descontada del stock es
          <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">cant_neta / (1 - merma)</code>.
        </p>
      </header>

      <DraftTable
        draft={draft}
        ingredientById={ingredientById}
        subproductById={subproductById}
        onRemove={handleRemoveRow}
      />

      <AddEdgeForm
        addType={addType}
        addChildId={addChildId}
        addQty={addQty}
        addMermaPercent={addMermaPercent}
        ingredients={ingredients}
        subproductsAvailable={subproductsAvailable}
        onChangeType={setAddType}
        onChangeChild={setAddChildId}
        onChangeQty={setAddQty}
        onChangeMerma={setAddMermaPercent}
        onAdd={handleAddRow}
        disabled={savingState === 'saving' || pending}
      />

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="text-sm">
          {isDirty ? (
            <span className="font-medium text-amber-700">Cambios sin guardar</span>
          ) : (
            <span className="text-gray-500">Receta sincronizada con servidor.</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDiscard}
            disabled={!isDirty || savingState === 'saving'}
          >
            Descartar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || savingState === 'saving'}
          >
            {savingState === 'saving' ? 'Guardando…' : 'Guardar receta'}
          </Button>
        </div>
      </div>

      {showExpandedCost && (
        <ExpandedCostView
          cost={expandedCost}
          error={expandedCostError}
          isDirty={isDirty}
        />
      )}
    </div>
  );
}

function DraftTable({
  draft,
  ingredientById,
  subproductById,
  onRemove,
}: {
  draft: DraftEdge[];
  ingredientById: Map<string, Ingredient>;
  subproductById: Map<string, Subproduct>;
  onRemove: (index: number) => void;
}) {
  if (draft.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-gray-900">La receta está vacía.</p>
        <p className="mt-1 text-sm text-gray-500">
          Agregá insumos o subproductos abajo para empezar.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <Th>Tipo</Th>
            <Th>Item</Th>
            <Th align="right">Cantidad neta</Th>
            <Th>Unidad</Th>
            <Th align="right">Merma</Th>
            <Th align="right">Bruto</Th>
            <Th align="right">Acción</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {draft.map((edge, index) => {
            const ing = edge.childType === 'ingredient' ? ingredientById.get(edge.childId) : null;
            const sub = edge.childType === 'subproduct' ? subproductById.get(edge.childId) : null;
            const name = ing?.name ?? sub?.name ?? '(item eliminado)';
            const unit = ing?.unitRecipe ?? sub?.unit ?? '?';
            const gross = edge.mermaPct < 1 ? edge.quantityNeta / (1 - edge.mermaPct) : 0;
            return (
              <tr key={`${edge.childType}-${edge.childId}-${index}`} className="hover:bg-gray-50">
                <Td>
                  <Badge tone={edge.childType === 'ingredient' ? 'ingredient' : 'subproduct'}>
                    {edge.childType === 'ingredient' ? 'Insumo' : 'Subproducto'}
                  </Badge>
                </Td>
                <Td>
                  <span className="font-medium text-gray-900">{name}</span>
                </Td>
                <Td align="right" mono>
                  {formatNumber(edge.quantityNeta)}
                </Td>
                <Td>{unit}</Td>
                <Td align="right" mono>
                  {(edge.mermaPct * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })}%
                </Td>
                <Td align="right" mono>
                  {formatNumber(gross)}
                </Td>
                <Td align="right">
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="font-medium text-red-600 hover:underline"
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

function AddEdgeForm({
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
}: {
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
}) {
  const options = addType === 'ingredient' ? ingredients : subproductsAvailable;
  return (
    <fieldset className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
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
            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
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
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
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

function ExpandedCostView({
  cost,
  error,
  isDirty,
}: {
  cost: ExpandedCostResponse | null;
  error: string | null;
  isDirty: boolean;
}) {
  if (isDirty) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">
          Hay cambios sin guardar. Guardá la receta para recalcular el desglose de insumos.
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">No se pudo calcular el desglose: {error}</p>
      </section>
    );
  }

  if (!cost) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">Calculando desglose…</p>
      </section>
    );
  }

  if (cost.totals.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">
          La receta está vacía — sin insumos para descontar al vender 1 unidad.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Desglose de insumos por unidad vendida</h2>
        <p className="mt-1 text-xs text-gray-500">
          Cantidad bruta a descontar de cada insumo cuando se vende 1 unidad de este producto,
          considerando merma y yield de subproductos transitivamente.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Insumo</Th>
              <Th align="right">Cantidad total</Th>
              <Th>Unidad</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cost.totals.map((t) => (
              <tr key={t.ingredientId} className="hover:bg-gray-50">
                <Td>
                  <span className="font-medium text-gray-900">{t.name}</span>
                </Td>
                <Td align="right" mono>
                  {formatNumber(t.totalQuantity)}
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

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'ingredient' | 'subproduct';
}) {
  const cls =
    tone === 'ingredient'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
      : 'bg-purple-50 text-purple-700 ring-purple-600/20';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
}

function sameEdges(a: DraftEdge[], b: DraftEdge[]): boolean {
  if (a.length !== b.length) return false;
  const norm = (e: DraftEdge): string =>
    `${e.childType}:${e.childId}:${e.quantityNeta}:${e.mermaPct}`;
  const sa = a.map(norm).sort();
  const sb = b.map(norm).sort();
  return sa.every((x, i) => x === sb[i]);
}
