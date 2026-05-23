'use client';

import { Button, Input } from '@pos-tercos/ui';
import type { FormState } from './ProductFormTypes';

export function ProductFormVariantsSection({
  form,
  setForm,
  pending,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  pending: boolean;
}) {
  const update = (i: number, patch: Partial<{ name: string; price: string }>) =>
    setForm((f) => ({
      ...f,
      sizes: f.sizes.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }));
  const add = () =>
    setForm((f) => ({ ...f, sizes: [...f.sizes, { name: '', price: '' }] }));
  const remove = (i: number) =>
    setForm((f) => ({ ...f, sizes: f.sizes.filter((_, idx) => idx !== i) }));

  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Variantes (el cliente elige una)
      </legend>
      <p className="text-xs text-muted-foreground">
        Cada variante tiene su propio precio. La receta de cada una (qué proteína
        descuenta) se asigna después de crear, en el editor de recetas.
      </p>

      {form.sizes.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-sm text-muted-foreground">
          Sin variantes todavía.
        </p>
      ) : (
        <ul className="space-y-2">
          {form.sizes.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input
                placeholder="Nombre (ej. Carne smash doble)"
                value={s.name}
                onChange={(e) => update(i, { name: e.target.value })}
                disabled={pending}
                className="flex-1"
              />
              <div className="relative w-36 shrink-0">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="Precio"
                  value={s.price}
                  onChange={(e) => update(i, { price: e.target.value })}
                  disabled={pending}
                  className="pl-6 tabular-nums"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(i)}
                disabled={pending}
                aria-label="Quitar variante"
                className="shrink-0 text-destructive"
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" size="sm" onClick={add} disabled={pending}>
        + Agregar variante
      </Button>
    </fieldset>
  );
}
