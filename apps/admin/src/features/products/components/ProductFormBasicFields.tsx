'use client';

import { Input, Label } from '@pos-tercos/ui';
import type { FormState } from './ProductFormTypes';

interface ProductFormBasicFieldsProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  pending: boolean;
}

export function ProductFormBasicFields({ form, setForm, pending }: ProductFormBasicFieldsProps) {
  return (
    <>
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
          className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
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
          <p className="text-xs text-muted-foreground">
            Precio de <strong>venta</strong> al cliente. No es el costo de compra.
          </p>
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
    </>
  );
}
