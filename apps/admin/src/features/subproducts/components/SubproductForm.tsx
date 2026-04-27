'use client';

import { Button, Input, Label } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Subproduct } from '@pos-tercos/types';
import { createSubproduct, deactivateSubproduct, updateSubproduct } from '../api/client';

interface SubproductFormProps {
  initial?: Subproduct;
}

interface FormState {
  name: string;
  yield: string;
  unit: string;
  isActive: boolean;
}

export function SubproductForm({ initial }: SubproductFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    name: initial?.name ?? '',
    yield: initial ? String(initial.yield) : '',
    unit: initial?.unit ?? 'unidad',
    isActive: initial?.isActive ?? true,
  }));

  const isEdit = Boolean(initial);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const yieldValue = Number(form.yield);
    if (!Number.isFinite(yieldValue) || yieldValue <= 0) {
      setError('El yield debe ser un número positivo.');
      return;
    }

    try {
      if (isEdit && initial) {
        await updateSubproduct(initial.id, {
          name: form.name,
          yield: yieldValue,
          unit: form.unit,
          isActive: form.isActive,
        });
      } else {
        await createSubproduct({
          name: form.name,
          yield: yieldValue,
          unit: form.unit,
        });
      }
      startTransition(() => {
        router.push('/subproducts');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  const handleDeactivate = async () => {
    if (!initial) return;
    if (!window.confirm(`¿Desactivar el subproducto "${initial.name}"?`)) return;
    setError(null);
    try {
      await deactivateSubproduct(initial.id);
      startTransition(() => {
        router.push('/subproducts');
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
          placeholder="Pollo Nashville cocido, masa pizza fermentada…"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="yield">Yield (unidades por batch)</Label>
          <Input
            id="yield"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            required
            disabled={pending}
            value={form.yield}
            onChange={(e) => setForm((f) => ({ ...f, yield: e.target.value }))}
            placeholder="7"
          />
          <p className="text-xs text-gray-500">
            Cuántas unidades produce 1 corrida de la receta.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="unit">Unidad</Label>
          <Input
            id="unit"
            required
            maxLength={20}
            disabled={pending}
            value={form.unit}
            onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            placeholder="unidad"
          />
          <p className="text-xs text-gray-500">Cómo se cuenta cada unidad del subproducto.</p>
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
            onClick={() => router.push('/subproducts')}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear subproducto'}
          </Button>
        </div>
      </div>
    </form>
  );
}
