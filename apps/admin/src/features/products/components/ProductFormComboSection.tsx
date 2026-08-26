'use client';

import type { Product } from '@pos-tercos/types';
import { Button, Input, Label, MoneyInput } from '@pos-tercos/ui';
import { useMemo } from 'react';
import { formatCop } from '../../../lib/format';
import type { FormState } from './ProductFormTypes';
import { newRowKey } from './ProductFormTypes';

export function ProductFormComboSection({
  form,
  setForm,
  pending,
  candidates,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  pending: boolean;
  /** Productos elegibles como componentes (activos, no combos). */
  candidates: Product[];
}) {
  const byId = useMemo(() => new Map(candidates.map((p) => [p.id, p])), [candidates]);

  const update = (i: number, patch: Partial<{ productId: string; quantity: string }>) =>
    setForm((f) => ({
      ...f,
      comboComponents: f.comboComponents.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    }));
  const add = () =>
    setForm((f) => ({
      ...f,
      comboComponents: [
        ...f.comboComponents,
        { rowKey: newRowKey(), productId: '', quantity: '1' },
      ],
    }));
  const remove = (i: number) =>
    setForm((f) => ({
      ...f,
      comboComponents: f.comboComponents.filter((_, idx) => idx !== i),
    }));

  const componentsSum = form.comboComponents.reduce((acc, c) => {
    const p = byId.get(c.productId);
    const qty = Number(c.quantity || 0);
    return acc + (p ? p.basePrice * (Number.isFinite(qty) ? qty : 0) : 0);
  }, 0);
  const comboPrice = Number(form.comboPrice);
  const hasComboPrice = Number.isFinite(comboPrice) && form.comboPrice !== '';
  const saving = hasComboPrice ? componentsSum - comboPrice : 0;
  const savingPct = componentsSum > 0 ? (saving / componentsSum) * 100 : 0;

  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Componentes del combo
      </legend>

      {form.comboComponents.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-sm text-muted-foreground">
          Agrega los productos que incluye el combo.
        </p>
      ) : (
        <ul className="space-y-2">
          {form.comboComponents.map((c, i) => (
            <li key={c.rowKey} className="flex items-center gap-2">
              <select
                value={c.productId}
                onChange={(e) => update(i, { productId: e.target.value })}
                disabled={pending}
                className="h-9 flex-1 rounded-md border border-input bg-card px-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">— Elegir producto —</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatCop(p.basePrice)})
                  </option>
                ))}
              </select>
              <Input
                type="number"
                inputMode="numeric"
                min="1"
                value={c.quantity}
                onChange={(e) => update(i, { quantity: e.target.value })}
                disabled={pending}
                className="w-20 shrink-0 tabular-nums"
                aria-label="Cantidad"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(i)}
                disabled={pending}
                aria-label="Quitar componente"
                className="shrink-0 text-destructive"
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" size="sm" onClick={add} disabled={pending}>
        + Agregar componente
      </Button>

      <div className="space-y-2 border-t border-border pt-3">
        <Label htmlFor="comboPrice">Precio del combo (COP)</Label>
        <MoneyInput
          id="comboPrice"
          required
          disabled={pending}
          value={form.comboPrice}
          onChange={(v) => setForm((f) => ({ ...f, comboPrice: v }))}
          placeholder="78.000"
        />
        {componentsSum > 0 ? (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Suma de componentes:{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {formatCop(componentsSum)}
            </span>
            {hasComboPrice ? (
              <>
                {' · '}Ahorro:{' '}
                <span
                  className={`font-semibold tabular-nums ${saving >= 0 ? 'text-success' : 'text-destructive'}`}
                >
                  {formatCop(saving)} ({savingPct.toFixed(0)}%)
                </span>
                {saving < 0 ? ' — el combo cuesta más que sus partes' : ''}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}
