'use client';

import { Button, Input, Label } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Ingredient } from '@pos-tercos/types';
import { createIngredient, deactivateIngredient, updateIngredient } from '../api/client';

interface IngredientFormProps {
  initial?: Ingredient;
}

interface FormState {
  name: string;
  unitPurchase: string;
  unitRecipe: string;
  conversionFactor: string;
  thresholdMin: string;
  isActive: boolean;
}

export function IngredientForm({ initial }: IngredientFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    name: initial?.name ?? '',
    unitPurchase: initial?.unitPurchase ?? '',
    unitRecipe: initial?.unitRecipe ?? '',
    conversionFactor: initial ? String(initial.conversionFactor) : '',
    thresholdMin: initial ? String(initial.thresholdMin) : '0',
    isActive: initial?.isActive ?? true,
  }));

  const isEdit = Boolean(initial);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const conversionFactor = Number(form.conversionFactor);
    const thresholdMin = Number(form.thresholdMin);
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
      setError('El factor de conversión debe ser un número positivo.');
      return;
    }
    if (!Number.isFinite(thresholdMin) || thresholdMin < 0) {
      setError('El threshold debe ser un número ≥ 0.');
      return;
    }

    try {
      if (isEdit && initial) {
        await updateIngredient(initial.id, {
          name: form.name,
          unitPurchase: form.unitPurchase,
          unitRecipe: form.unitRecipe,
          conversionFactor,
          thresholdMin,
          isActive: form.isActive,
        });
      } else {
        await createIngredient({
          name: form.name,
          unitPurchase: form.unitPurchase,
          unitRecipe: form.unitRecipe,
          conversionFactor,
          thresholdMin,
        });
      }
      startTransition(() => {
        router.push('/ingredients');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  const handleDeactivate = async () => {
    if (!initial) return;
    if (!window.confirm(`¿Desactivar el insumo "${initial.name}"?`)) return;
    setError(null);
    try {
      await deactivateIngredient(initial.id);
      startTransition(() => {
        router.push('/ingredients');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          required
          maxLength={120}
          disabled={pending}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Pollo crudo, Sal, Pan brioche…"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="unitPurchase">Unidad de compra</Label>
          <Input
            id="unitPurchase"
            required
            maxLength={20}
            disabled={pending}
            value={form.unitPurchase}
            onChange={(e) => setForm((f) => ({ ...f, unitPurchase: e.target.value }))}
            placeholder="kg, lt, caja"
          />
          <p className="text-xs text-gray-500">Unidad como se compra al proveedor.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="unitRecipe">Unidad de receta</Label>
          <Input
            id="unitRecipe"
            required
            maxLength={20}
            disabled={pending}
            value={form.unitRecipe}
            onChange={(e) => setForm((f) => ({ ...f, unitRecipe: e.target.value }))}
            placeholder="g, ml, unidad"
          />
          <p className="text-xs text-gray-500">Unidad como la consume la receta.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="conversionFactor">Factor de conversión</Label>
          <Input
            id="conversionFactor"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            required
            disabled={pending}
            value={form.conversionFactor}
            onChange={(e) => setForm((f) => ({ ...f, conversionFactor: e.target.value }))}
            placeholder="1000"
          />
          <p className="text-xs text-gray-500">
            1 {form.unitPurchase || 'compra'} = N {form.unitRecipe || 'receta'}.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="thresholdMin">Stock mínimo (alerta)</Label>
          <Input
            id="thresholdMin"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            disabled={pending}
            value={form.thresholdMin}
            onChange={(e) => setForm((f) => ({ ...f, thresholdMin: e.target.value }))}
            placeholder="0"
          />
          <p className="text-xs text-gray-500">
            En unidad de receta. Bajo este valor → alerta de stock crítico.
          </p>
        </div>
      </div>

      {isEdit && (
        <div className="flex items-center gap-2">
          <input
            id="isActive"
            type="checkbox"
            disabled={pending}
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Label htmlFor="isActive">Activo</Label>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
        {isEdit ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDeactivate}
            disabled={pending}
          >
            Desactivar
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push('/ingredients')}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear insumo'}
          </Button>
        </div>
      </div>
    </form>
  );
}
