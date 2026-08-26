'use client';

import { Button, Input, MoneyInput } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { listIngredients } from '../../ingredients';
import { listSubproducts } from '../../subproducts';
import type { ExtraRow, FormState } from './ProductFormTypes';
import { newRowKey } from './ProductFormTypes';

interface ConsumeOption {
  id: string;
  name: string;
  unit: string;
}

export function ProductFormExtrasSection({
  form,
  setForm,
  pending,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  pending: boolean;
}) {
  // Opciones para el selector de consumo. Se cargan una vez al montar la
  // sección (listas chicas en este negocio).
  const [ingredientOptions, setIngredientOptions] = useState<ConsumeOption[]>([]);
  const [subproductOptions, setSubproductOptions] = useState<ConsumeOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([listIngredients(), listSubproducts()]).then(([ings, subs]) => {
      if (cancelled) return;
      setIngredientOptions(
        ings.filter((i) => i.isActive).map((i) => ({ id: i.id, name: i.name, unit: i.unitRecipe })),
      );
      setSubproductOptions(
        subs.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name, unit: s.unit ?? 'unidad' })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (i: number, patch: Partial<ExtraRow>) =>
    setForm((f) => ({
      ...f,
      modifiers: f.modifiers.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    }));
  const add = () =>
    setForm((f) => ({
      ...f,
      modifiers: [
        ...f.modifiers,
        {
          rowKey: newRowKey(),
          name: '',
          priceDelta: '',
          consumeChildType: '',
          consumeChildId: '',
          consumeQty: '',
        },
      ],
    }));
  const remove = (i: number) =>
    setForm((f) => ({ ...f, modifiers: f.modifiers.filter((_, idx) => idx !== i) }));

  return (
    <fieldset className="space-y-3 rounded-md border border-border p-4">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Extras opcionales
      </legend>
      <p className="text-xs text-muted-foreground">
        Agregados que el cliente marca (ej. tocineta extra +$3.000). Si el extra gasta
        inventario (doble carne, queso extra), configura qué descuenta — si no, esa
        porción sale del stock sin registrarse.
      </p>

      {form.modifiers.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-sm text-muted-foreground">
          Sin extras.
        </p>
      ) : (
        <ul className="space-y-3">
          {form.modifiers.map((m, i) => (
            <li key={m.rowKey} className="space-y-2 rounded-md border border-border/60 p-3">
              <div className="flex items-center gap-2">
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
                  aria-label={`Quitar extra ${m.name || i + 1}`}
                  className="shrink-0 text-destructive"
                >
                  ✕
                </Button>
              </div>
              <ConsumeRow
                row={m}
                index={i}
                pending={pending}
                ingredientOptions={ingredientOptions}
                subproductOptions={subproductOptions}
                onChange={(patch) => update(i, patch)}
              />
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

function ConsumeRow({
  row,
  index,
  pending,
  ingredientOptions,
  subproductOptions,
  onChange,
}: {
  row: ExtraRow;
  index: number;
  pending: boolean;
  ingredientOptions: ConsumeOption[];
  subproductOptions: ConsumeOption[];
  onChange: (patch: Partial<ExtraRow>) => void;
}) {
  const options = row.consumeChildType === 'subproduct' ? subproductOptions : ingredientOptions;
  const selected = options.find((o) => o.id === row.consumeChildId);
  const selectClass =
    'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50';

  return (
    <div className="flex flex-wrap items-center gap-2 pl-1 text-sm">
      <span className="text-xs text-muted-foreground">Consumo:</span>
      <select
        value={row.consumeChildType}
        onChange={(e) =>
          onChange({
            consumeChildType: e.target.value as ExtraRow['consumeChildType'],
            consumeChildId: '',
            consumeQty: e.target.value ? row.consumeQty : '',
          })
        }
        disabled={pending}
        aria-label={`Tipo de consumo del extra ${index + 1}`}
        className={selectClass}
      >
        <option value="">No descuenta inventario</option>
        <option value="ingredient">Insumo</option>
        <option value="subproduct">Subproducto</option>
      </select>
      {row.consumeChildType ? (
        <>
          <select
            value={row.consumeChildId}
            onChange={(e) => onChange({ consumeChildId: e.target.value })}
            disabled={pending}
            aria-label={`Qué consume el extra ${index + 1}`}
            className={`${selectClass} min-w-44`}
          >
            <option value="">Elegir…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder="Cantidad"
            value={row.consumeQty}
            onChange={(e) => onChange({ consumeQty: e.target.value })}
            disabled={pending}
            aria-label={`Cantidad que consume el extra ${index + 1}`}
            className="w-28"
          />
          <span className="text-xs text-muted-foreground">
            {selected ? selected.unit : ''} por unidad vendida
          </span>
        </>
      ) : null}
    </div>
  );
}
