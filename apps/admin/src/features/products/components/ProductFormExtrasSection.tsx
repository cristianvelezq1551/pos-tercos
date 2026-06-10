'use client';

import { Button, Input, MoneyInput } from '@pos-tercos/ui';
import type { FormState } from './ProductFormTypes';

export function ProductFormExtrasSection({
  form,
  setForm,
  pending,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  pending: boolean;
}) {
  const update = (i: number, patch: Partial<{ name: string; priceDelta: string }>) =>
    setForm((f) => ({
      ...f,
      modifiers: f.modifiers.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    }));
  const add = () =>
    setForm((f) => ({ ...f, modifiers: [...f.modifiers, { name: '', priceDelta: '' }] }));
  const remove = (i: number) =>
    setForm((f) => ({ ...f, modifiers: f.modifiers.filter((_, idx) => idx !== i) }));

  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Extras opcionales
      </legend>
      <p className="text-xs text-muted-foreground">
        Agregados que el cliente marca (ej. tocineta extra +$3.000, sin cebolla $0).
      </p>

      {form.modifiers.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-sm text-muted-foreground">
          Sin extras.
        </p>
      ) : (
        <ul className="space-y-2">
          {form.modifiers.map((m, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input
                placeholder="Nombre (ej. Tocineta extra)"
                value={m.name}
                onChange={(e) => update(i, { name: e.target.value })}
                disabled={pending}
                className="flex-1"
              />
              <div className="w-32 shrink-0">
                <MoneyInput
                  prefix="+$"
                  placeholder="0"
                  value={m.priceDelta}
                  onChange={(v) => update(i, { priceDelta: v })}
                  disabled={pending}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(i)}
                disabled={pending}
                aria-label="Quitar extra"
                className="shrink-0 text-destructive"
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" size="sm" onClick={add} disabled={pending}>
        + Agregar extra
      </Button>
    </fieldset>
  );
}
