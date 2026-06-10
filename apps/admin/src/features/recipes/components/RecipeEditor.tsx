'use client';

import { Button } from '@pos-tercos/ui';
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
  getSizeExpandedCost,
  getSubproductExpandedCost,
  setProductRecipe,
  setSizeRecipe,
  setSubproductRecipe,
} from '../api/client';
import { RecipeDraftTable, type DraftEdge } from './RecipeDraftTable';
import { RecipeAddEdgeForm } from './RecipeAddEdgeForm';
import { RecipeExpandedCostView } from './RecipeExpandedCostView';

interface RecipeEditorProps {
  parentType: 'product' | 'subproduct';
  parentId: string;
  parentName: string;
  initialRecipe: RecipeResponse;
  ingredients: Ingredient[];
  subproducts: Subproduct[];
  showExpandedCost?: boolean;
  /** Si está, se edita la receta de esa variante (aditiva sobre la base). */
  sizeId?: string;
  /** Oculta el header interno (cuando lo provee un contenedor con tabs). */
  hideHeader?: boolean;
}

function recipeToDraft(recipe: RecipeResponse): DraftEdge[] {
  return recipe.edges.map((e) => ({
    childType: e.childIngredientId !== null ? 'ingredient' : 'subproduct',
    childId: (e.childIngredientId ?? e.childSubproductId) as string,
    quantityNeta: e.quantityNeta,
    mermaPct: e.mermaPct,
  }));
}

function sameEdges(a: DraftEdge[], b: DraftEdge[]): boolean {
  if (a.length !== b.length) return false;
  const norm = (e: DraftEdge): string =>
    `${e.childType}:${e.childId}:${e.quantityNeta}:${e.mermaPct}`;
  const sa = a.map(norm).sort();
  const sb = b.map(norm).sort();
  return sa.every((x, i) => x === sb[i]);
}

export function RecipeEditor({
  parentType,
  parentId,
  parentName,
  initialRecipe,
  ingredients,
  subproducts,
  showExpandedCost = false,
  sizeId,
  hideHeader = false,
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

  const subproductsAvailable = useMemo(() => {
    if (parentType !== 'subproduct') return subproducts;
    return subproducts.filter((s) => s.id !== parentId);
  }, [parentType, parentId, subproducts]);

  useEffect(() => {
    if (!showExpandedCost || isDirty) return;
    let cancelled = false;
    const fetchCost = (): ReturnType<typeof getExpandedCost> => {
      if (sizeId) return getSizeExpandedCost(parentId, sizeId);
      if (parentType === 'subproduct') return getSubproductExpandedCost(parentId);
      return getExpandedCost(parentId);
    };
    fetchCost()
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
  }, [showExpandedCost, isDirty, parentId, parentType, sizeId, savedSnapshot]);

  const handleAddRow = () => {
    setError(null);
    if (!addChildId) { setError('Elige un insumo o subproducto.'); return; }
    if (draft.some((d) => d.childType === addType && d.childId === addChildId)) {
      setError('Ese item ya está en la receta. Edita la cantidad existente.'); return;
    }
    const qty = Number(addQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('La cantidad debe ser un número positivo.'); return;
    }
    const mermaPercent = Number(addMermaPercent);
    if (!Number.isFinite(mermaPercent) || mermaPercent < 0 || mermaPercent >= 100) {
      setError('La merma debe ser un porcentaje entre 0 y menos de 100.'); return;
    }
    setDraft((d) => [
      ...d,
      { childType: addType, childId: addChildId, quantityNeta: qty, mermaPct: mermaPercent / 100 },
    ]);
    setAddChildId('');
    setAddQty('');
    setAddMermaPercent('0');
  };

  const handleSave = async () => {
    setError(null);
    setSavingState('saving');
    const edges: RecipeEdgeInput[] = draft.map((d) =>
      d.childType === 'ingredient'
        ? { childType: 'ingredient', childId: d.childId, quantityNeta: d.quantityNeta, mermaPct: d.mermaPct }
        : { childType: 'subproduct', childId: d.childId, quantityNeta: d.quantityNeta, mermaPct: d.mermaPct },
    );
    try {
      const updated = sizeId
        ? await setSizeRecipe(parentId, sizeId, edges)
        : parentType === 'product'
          ? await setProductRecipe(parentId, edges)
          : await setSubproductRecipe(parentId, edges);
      const next = recipeToDraft(updated);
      setDraft(next);
      setSavedSnapshot(next);
      startTransition(() => { router.refresh(); });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSavingState('idle');
    }
  };

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Receta · {parentType === 'product' ? 'Producto' : 'Subproducto'}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{parentName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define qué insumos o subproductos consume {parentType === 'product' ? 'el producto' : 'el subproducto'}.
            La <strong>cantidad neta</strong> es lo que queda en el plato; la <strong>merma</strong> es lo
            que se pierde al preparar (limpiar, recortar). Por eso del stock se descuenta un poco más:
            si una porción usa 180 g netos y se pierde 5%, se descuentan ~189 g.
          </p>
        </header>
      )}

      <RecipeDraftTable
        draft={draft}
        ingredientById={ingredientById}
        subproductById={subproductById}
        onRemove={(index) => setDraft((d) => d.filter((_, i) => i !== index))}
      />

      <RecipeAddEdgeForm
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
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <div className="text-sm">
          {isDirty ? (
            <span className="font-medium text-warning">Cambios sin guardar</span>
          ) : (
            <span className="text-muted-foreground">Receta sincronizada con servidor.</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setDraft(savedSnapshot); setError(null); }}
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
        <RecipeExpandedCostView
          cost={expandedCost}
          error={expandedCostError}
          isDirty={isDirty}
        />
      )}
    </div>
  );
}
