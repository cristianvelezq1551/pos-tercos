'use client';

import { Button, Input, Label } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { CreateProduct, Product, UpdateProduct } from '@pos-tercos/types';
import { createProduct, deactivateProduct, updateProduct } from '../api/client';

interface ProductFormProps {
  initial?: Product;
}

interface FormState {
  name: string;
  description: string;
  basePrice: string;
  category: string;
  imageUrl: string;
  modifiersEnabled: boolean;
  isCombo: boolean;
  comboPrice: string;
  isActive: boolean;
}

export function ProductForm({ initial }: ProductFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    basePrice: initial ? String(initial.basePrice) : '',
    category: initial?.category ?? '',
    imageUrl: initial?.imageUrl ?? '',
    modifiersEnabled: initial?.modifiersEnabled ?? false,
    isCombo: initial?.isCombo ?? false,
    comboPrice: initial?.comboPrice !== null && initial?.comboPrice !== undefined ? String(initial.comboPrice) : '',
    isActive: initial?.isActive ?? true,
  }));

  const isEdit = Boolean(initial);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const basePrice = Number(form.basePrice);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      setError('El precio base debe ser un número ≥ 0.');
      return;
    }

    let comboPriceParsed: number | null | undefined;
    if (form.isCombo) {
      const v = Number(form.comboPrice);
      if (!Number.isFinite(v) || v < 0) {
        setError('Cuando es combo, el precio del combo debe ser un número ≥ 0.');
        return;
      }
      comboPriceParsed = v;
    } else {
      comboPriceParsed = null;
    }

    try {
      if (isEdit && initial) {
        const update: UpdateProduct = {
          name: form.name,
          description: form.description || null,
          basePrice,
          category: form.category || null,
          imageUrl: form.imageUrl || null,
          modifiersEnabled: form.modifiersEnabled,
          isCombo: form.isCombo,
          comboPrice: comboPriceParsed,
          isActive: form.isActive,
        };
        await updateProduct(initial.id, update);
      } else {
        const create: CreateProduct = {
          name: form.name,
          description: form.description || null,
          basePrice,
          category: form.category || null,
          imageUrl: form.imageUrl || null,
          modifiersEnabled: form.modifiersEnabled,
          isCombo: form.isCombo,
          comboPrice: comboPriceParsed,
        };
        await createProduct(create);
      }
      startTransition(() => {
        router.push('/products');
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    }
  };

  const handleDeactivate = async () => {
    if (!initial) return;
    if (!window.confirm(`¿Desactivar el producto "${initial.name}"?`)) return;
    setError(null);
    try {
      await deactivateProduct(initial.id);
      startTransition(() => {
        router.push('/products');
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
          placeholder="Hamburguesa Nashville, Combo Familiar…"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <textarea
          id="description"
          maxLength={500}
          rows={3}
          disabled={pending}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
          placeholder="Descripción opcional para el menú."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="basePrice">Precio base (COP)</Label>
          <Input
            id="basePrice"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            required
            disabled={pending}
            value={form.basePrice}
            onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
            placeholder="18000"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Categoría</Label>
          <Input
            id="category"
            maxLength={60}
            disabled={pending}
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            placeholder="Hamburguesas, Bebidas, Acompañamientos…"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="imageUrl">URL de imagen</Label>
        <Input
          id="imageUrl"
          type="url"
          maxLength={500}
          disabled={pending}
          value={form.imageUrl}
          onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
          placeholder="https://…"
        />
      </div>

      <fieldset className="space-y-3 rounded-md border border-gray-200 p-4">
        <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Configuración
        </legend>

        <div className="flex items-center gap-2">
          <input
            id="modifiersEnabled"
            type="checkbox"
            disabled={pending}
            checked={form.modifiersEnabled}
            onChange={(e) => setForm((f) => ({ ...f, modifiersEnabled: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Label htmlFor="modifiersEnabled">
            Permite modificadores (sin queso, agregar tocino, etc.)
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="isCombo"
            type="checkbox"
            disabled={pending}
            checked={form.isCombo}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                isCombo: e.target.checked,
                comboPrice: e.target.checked ? f.comboPrice : '',
              }))
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Label htmlFor="isCombo">Es un combo (incluye otros productos)</Label>
        </div>

        {form.isCombo && (
          <div className="space-y-2 pl-6">
            <Label htmlFor="comboPrice">Precio del combo (COP)</Label>
            <Input
              id="comboPrice"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              disabled={pending}
              value={form.comboPrice}
              onChange={(e) => setForm((f) => ({ ...f, comboPrice: e.target.value }))}
              placeholder="35000"
            />
            <p className="text-xs text-gray-500">
              Precio total del combo (típicamente con descuento sobre la suma de componentes).
            </p>
          </div>
        )}

        {isEdit && (
          <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
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
      </fieldset>

      {!isEdit && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Las variantes (tamaños), modificadores específicos y componentes del combo se gestionan en
          una pantalla dedicada (próximamente). La receta se asigna después de crear el producto.
        </p>
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
            onClick={() => router.push('/products')}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </div>
      </div>
    </form>
  );
}
