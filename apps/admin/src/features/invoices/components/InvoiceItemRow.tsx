'use client';

import { Button, Input, Label, cn } from '@pos-tercos/ui';
import { useState } from 'react';
import type { Ingredient } from '@pos-tercos/types';
import { createIngredient } from '../../ingredients';

export interface DraftRow {
  localId: string;
  ingredientId: string | null;
  descriptionRaw: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

interface InvoiceItemRowProps {
  index: number;
  row: DraftRow;
  ingredients: Ingredient[];
  disabled?: boolean;
  onChange: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
  onIngredientCreated: (ingredient: Ingredient) => void;
}

export function InvoiceItemRow({
  index,
  row,
  ingredients,
  disabled,
  onChange,
  onRemove,
  onIngredientCreated,
}: InvoiceItemRowProps) {
  const [creating, setCreating] = useState(false);
  const isMatched = Boolean(row.ingredientId);

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isMatched
          ? 'border-green-200 bg-green-50/30'
          : 'border-amber-300 bg-amber-50/30',
      )}
    >
      <div className="flex items-start gap-2 text-xs">
        <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 font-mono text-[10px] font-semibold text-gray-700">
          {index}
        </span>
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`desc-${row.localId}`}>Descripción tal como aparece en factura</Label>
              <Input
                id={`desc-${row.localId}`}
                disabled={disabled}
                value={row.descriptionRaw}
                onChange={(e) => onChange({ descriptionRaw: e.target.value })}
                placeholder="Pollo entero limpio x 1.8 kg"
              />
            </div>
            <div className="flex items-end gap-2">
              {isMatched ? (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                  ✓ Insumo asociado
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                  ⚠ Sin asociar
                </span>
              )}
              <button
                type="button"
                onClick={onRemove}
                disabled={disabled}
                className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                aria-label="Quitar fila"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor={`qty-${row.localId}`}>Cantidad</Label>
              <Input
                id={`qty-${row.localId}`}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                disabled={disabled}
                value={row.quantity}
                onChange={(e) => onChange({ quantity: parseNum(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`unit-${row.localId}`}>Unidad</Label>
              <Input
                id={`unit-${row.localId}`}
                disabled={disabled}
                value={row.unit}
                onChange={(e) => onChange({ unit: e.target.value })}
                placeholder="kg, lt, unidad"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`price-${row.localId}`}>Precio unitario</Label>
              <Input
                id={`price-${row.localId}`}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                disabled={disabled}
                value={row.unitPrice}
                onChange={(e) => onChange({ unitPrice: parseNum(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`total-${row.localId}`}>Total</Label>
              <Input
                id={`total-${row.localId}`}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                disabled={disabled}
                value={row.total}
                onChange={(e) => onChange({ total: parseNum(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`ing-${row.localId}`}>Asociar a insumo del catálogo</Label>
            <div className="flex gap-2">
              <select
                id={`ing-${row.localId}`}
                value={row.ingredientId ?? ''}
                onChange={(e) => onChange({ ingredientId: e.target.value || null })}
                disabled={disabled}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="">— Seleccionar insumo existente —</option>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.unitPurchase} → {i.unitRecipe})
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreating((v) => !v)}
                disabled={disabled}
              >
                {creating ? 'Cancelar' : '+ Crear nuevo'}
              </Button>
            </div>
          </div>

          {creating && (
            <CreateIngredientInline
              defaultName={row.descriptionRaw}
              defaultUnitPurchase={row.unit}
              onCreated={(ingredient) => {
                onIngredientCreated(ingredient);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function parseNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface CreateIngredientInlineProps {
  defaultName: string;
  defaultUnitPurchase: string;
  onCreated: (ingredient: Ingredient) => void;
  onCancel: () => void;
}

function CreateIngredientInline({
  defaultName,
  defaultUnitPurchase,
  onCreated,
  onCancel,
}: CreateIngredientInlineProps) {
  const [name, setName] = useState(defaultName);
  const [unitPurchase, setUnitPurchase] = useState(defaultUnitPurchase);
  const [unitRecipe, setUnitRecipe] = useState(defaultUnitPurchase);
  const [conversionFactor, setConversionFactor] = useState('1');
  const [thresholdMin, setThresholdMin] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleCreate = async () => {
    setErr(null);
    const factor = Number(conversionFactor);
    if (!Number.isFinite(factor) || factor <= 0) {
      setErr('El factor debe ser positivo.');
      return;
    }
    const threshold = Number(thresholdMin);
    if (!Number.isFinite(threshold) || threshold < 0) {
      setErr('Threshold inválido.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createIngredient({
        name: name.trim(),
        unitPurchase: unitPurchase.trim(),
        unitRecipe: unitRecipe.trim(),
        conversionFactor: factor,
        thresholdMin: threshold,
      });
      onCreated(created);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
        Crear nuevo insumo (se asociará automáticamente a esta línea)
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ci-name">Nombre</Label>
          <Input
            id="ci-name"
            disabled={submitting}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Pollo crudo"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="ci-up">Unidad compra</Label>
            <Input
              id="ci-up"
              disabled={submitting}
              value={unitPurchase}
              onChange={(e) => setUnitPurchase(e.target.value)}
              placeholder="kg"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ci-ur">Unidad receta</Label>
            <Input
              id="ci-ur"
              disabled={submitting}
              value={unitRecipe}
              onChange={(e) => setUnitRecipe(e.target.value)}
              placeholder="g"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ci-cf">Factor (1 compra = N receta)</Label>
          <Input
            id="ci-cf"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            disabled={submitting}
            value={conversionFactor}
            onChange={(e) => setConversionFactor(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ci-th">Threshold (alerta)</Label>
          <Input
            id="ci-th"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            disabled={submitting}
            value={thresholdMin}
            onChange={(e) => setThresholdMin(e.target.value)}
          />
        </div>
      </div>
      {err && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
        >
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={handleCreate} disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear y asociar'}
        </Button>
      </div>
    </div>
  );
}
