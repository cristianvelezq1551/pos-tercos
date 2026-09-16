'use client';

import type { Product } from '@pos-tercos/types';
import { Button, Input, Label, MoneyInput } from '@pos-tercos/ui';
import type { FormState } from './ProductFormTypes';
import { newRowKey } from './ProductFormTypes';

/**
 * Grupos a ELEGIR de un combo ("Bebida — elige 2").
 *
 * Es lo que permite que el inventario descuente la bebida que realmente salió:
 * sin esto, un combo con Pepsi fija descontaba Pepsi aunque el cliente se
 * llevara Coca-Cola, y el descuadre no se veía en ningún lado.
 */
export function ProductFormChoiceGroupsSection({
  form,
  setForm,
  pending,
  candidates,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  pending: boolean;
  /** Productos elegibles como opción (activos, no combos). */
  candidates: Product[];
}) {
  const updateGroup = (gi: number, patch: Partial<{ label: string; quantity: string }>) =>
    setForm((f) => ({
      ...f,
      choiceGroups: f.choiceGroups.map((g, i) => (i === gi ? { ...g, ...patch } : g)),
    }));

  const updateOption = (
    gi: number,
    oi: number,
    patch: Partial<{ productId: string; priceDelta: string }>,
  ) =>
    setForm((f) => ({
      ...f,
      choiceGroups: f.choiceGroups.map((g, i) =>
        i === gi
          ? { ...g, options: g.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) }
          : g,
      ),
    }));

  const addGroup = () =>
    setForm((f) => ({
      ...f,
      choiceGroups: [
        ...f.choiceGroups,
        {
          rowKey: newRowKey(),
          label: '',
          quantity: '1',
          // Nace con dos filas: un grupo de una sola opción no ofrece nada que
          // elegir, y el servidor lo rechaza.
          options: [
            { rowKey: newRowKey(), productId: '', priceDelta: '' },
            { rowKey: newRowKey(), productId: '', priceDelta: '' },
          ],
        },
      ],
    }));

  const removeGroup = (gi: number) =>
    setForm((f) => ({ ...f, choiceGroups: f.choiceGroups.filter((_, i) => i !== gi) }));

  const addOption = (gi: number) =>
    setForm((f) => ({
      ...f,
      choiceGroups: f.choiceGroups.map((g, i) =>
        i === gi
          ? { ...g, options: [...g.options, { rowKey: newRowKey(), productId: '', priceDelta: '' }] }
          : g,
      ),
    }));

  const removeOption = (gi: number, oi: number) =>
    setForm((f) => ({
      ...f,
      choiceGroups: f.choiceGroups.map((g, i) =>
        i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g,
      ),
    }));

  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Grupos para elegir
      </legend>

      {form.choiceGroups.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-sm text-muted-foreground">
          Si el cliente elige algo del combo —la bebida, el acompañamiento— agrégalo acá.
          Así se descuenta lo que realmente se llevó.
        </p>
      ) : null}

      {form.choiceGroups.map((g, gi) => (
        <div key={g.rowKey} className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor={`grupo-${g.rowKey}`}>Qué elige</Label>
              <Input
                id={`grupo-${g.rowKey}`}
                value={g.label}
                onChange={(e) => updateGroup(gi, { label: e.target.value })}
                disabled={pending}
                placeholder="Bebida"
              />
            </div>
            <div className="w-28 space-y-1">
              <Label htmlFor={`cuantas-${g.rowKey}`}>Cuántas</Label>
              <Input
                id={`cuantas-${g.rowKey}`}
                type="number"
                inputMode="numeric"
                min="1"
                value={g.quantity}
                onChange={(e) => updateGroup(gi, { quantity: e.target.value })}
                disabled={pending}
                className="tabular-nums"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeGroup(gi)}
              disabled={pending}
              aria-label={`Quitar grupo ${g.label || gi + 1}`}
              className="shrink-0 text-destructive"
            >
              ✕
            </Button>
          </div>

          <ul className="space-y-2">
            {g.options.map((o, oi) => (
              <li key={o.rowKey} className="flex items-center gap-2">
                <select
                  value={o.productId}
                  onChange={(e) => updateOption(gi, oi, { productId: e.target.value })}
                  disabled={pending}
                  aria-label="Opción"
                  className="h-9 flex-1 rounded-md border border-input bg-card px-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">— Elegir producto —</option>
                  {candidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="w-32 shrink-0">
                  <MoneyInput
                    value={o.priceDelta}
                    onChange={(v) => updateOption(gi, oi, { priceDelta: v })}
                    disabled={pending}
                    placeholder="Recargo"
                    aria-label="Recargo de la opción"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeOption(gi, oi)}
                  disabled={pending || g.options.length <= 2}
                  aria-label="Quitar opción"
                  className="shrink-0 text-destructive"
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addOption(gi)}
            disabled={pending}
          >
            + Agregar opción
          </Button>
          <p className="text-xs text-muted-foreground">
            El recargo se cobra por cada unidad elegida: $3.000 en dos jugos son $6.000.
          </p>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addGroup} disabled={pending}>
        + Agregar grupo para elegir
      </Button>
    </fieldset>
  );
}
