'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@pos-tercos/ui';
import {
  PromotionTypeEnum,
  type CreatePromotion,
  type Product,
  type PromotionType,
} from '@pos-tercos/types';
import { listProducts } from '../../products';
import { createPromotion } from '../api';

const DAYS: { mask: number; label: string }[] = [
  { mask: 1, label: 'L' },
  { mask: 2, label: 'M' },
  { mask: 4, label: 'X' },
  { mask: 8, label: 'J' },
  { mask: 16, label: 'V' },
  { mask: 32, label: 'S' },
  { mask: 64, label: 'D' },
];

interface FormState {
  name: string;
  type: PromotionType;
  discountPctPercent: string; // input en % (0..99) → guarda /100
  discountFixed: string; // input en COP entero
  bogoBuyQty: string;
  bogoGetQty: string;
  comboMode: 'pct' | 'fixed';
  daysMask: number;
  timeStart: string; // HH:MM
  timeEnd: string;
  activeFrom: string; // YYYY-MM-DD o ''
  activeTo: string;
  productIds: Set<string>;
}

const INITIAL_STATE: FormState = {
  name: '',
  type: 'PERCENT_OFF',
  discountPctPercent: '',
  discountFixed: '',
  bogoBuyQty: '1',
  bogoGetQty: '1',
  comboMode: 'pct',
  daysMask: 127,
  timeStart: '00:00',
  timeEnd: '23:59',
  activeFrom: '',
  activeTo: '',
  productIds: new Set(),
};

export function PromotionForm() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [state, setState] = useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProducts()
      .then((p) => setProducts(p.filter((x) => x.isActive)))
      .catch((e) => setProductsError((e as Error).message));
  }, []);

  const validation = useMemo(() => validate(state), [state]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function toggleDay(mask: number) {
    update('daysMask', state.daysMask ^ mask);
  }

  function toggleProduct(id: string) {
    const next = new Set(state.productIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update('productIds', next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validation.error) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload(state);
      await createPromotion(payload);
      router.push('/promotions');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <Section title="Información general">
        <Field label="Nombre" required>
          <input
            type="text"
            required
            value={state.name}
            maxLength={120}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Ej. 20% off Hamburguesa Nashville lunes a jueves"
            className={inputClass}
          />
        </Field>

        <Field label="Tipo" required>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PromotionTypeEnum.options.map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm ${
                  state.type === t
                    ? 'border-primary bg-destructive/10 text-primary font-semibold'
                    : 'border-border bg-card text-foreground hover:bg-muted/40'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  className="sr-only"
                  value={t}
                  checked={state.type === t}
                  onChange={() => update('type', t)}
                />
                {labelFor(t)}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{descriptionFor(state.type)}</p>
        </Field>
      </Section>

      <Section title="Descuento">
        {state.type === 'PERCENT_OFF' && (
          <Field label="Porcentaje (1-99)" required>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={99}
                step={1}
                required
                value={state.discountPctPercent}
                onChange={(e) => update('discountPctPercent', e.target.value)}
                className={`${inputClass} max-w-[120px]`}
                placeholder="20"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </Field>
        )}

        {state.type === 'FIXED_OFF' && (
          <Field label="Monto en COP" required>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                min={1}
                step={1}
                required
                value={state.discountFixed}
                onChange={(e) => update('discountFixed', e.target.value)}
                className={`${inputClass} max-w-[200px]`}
                placeholder="2000"
              />
            </div>
          </Field>
        )}

        {state.type === 'BOGO' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Compra (paid)" required>
              <input
                type="number"
                min={1}
                step={1}
                required
                value={state.bogoBuyQty}
                onChange={(e) => update('bogoBuyQty', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Lleva gratis" required>
              <input
                type="number"
                min={1}
                step={1}
                required
                value={state.bogoGetQty}
                onChange={(e) => update('bogoGetQty', e.target.value)}
                className={inputClass}
              />
            </Field>
            <p className="col-span-2 text-xs text-muted-foreground">
              Cada vez que el cliente compre {state.bogoBuyQty || '?'} unidades, se le
              regalan {state.bogoGetQty || '?'}. Solo aplica si la línea tiene al menos{' '}
              {Number(state.bogoBuyQty || 0) + Number(state.bogoGetQty || 0)} unidades.
            </p>
          </div>
        )}

        {state.type === 'COMBO_OFF' && (
          <>
            <Field label="Tipo de descuento" required>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={state.comboMode === 'pct'}
                    onChange={() => update('comboMode', 'pct')}
                  />
                  Porcentaje
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={state.comboMode === 'fixed'}
                    onChange={() => update('comboMode', 'fixed')}
                  />
                  Monto fijo
                </label>
              </div>
            </Field>
            {state.comboMode === 'pct' ? (
              <Field label="Porcentaje (1-99)" required>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    step={1}
                    required
                    value={state.discountPctPercent}
                    onChange={(e) => update('discountPctPercent', e.target.value)}
                    className={`${inputClass} max-w-[120px]`}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </Field>
            ) : (
              <Field label="Monto en COP" required>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={state.discountFixed}
                    onChange={(e) => update('discountFixed', e.target.value)}
                    className={`${inputClass} max-w-[200px]`}
                  />
                </div>
              </Field>
            )}
            <p className="text-xs text-muted-foreground">
              COMBO_OFF solo aplica cuando el producto vendido es un combo (Product.isCombo).
            </p>
          </>
        )}
      </Section>

      <Section title="Cuándo aplica">
        <Field label="Días de la semana" required>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <label
                key={d.mask}
                className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${
                  (state.daysMask & d.mask) !== 0
                    ? 'border-primary bg-destructive/10 text-primary font-semibold'
                    : 'border-border bg-card text-foreground hover:bg-muted/40'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={(state.daysMask & d.mask) !== 0}
                  onChange={() => toggleDay(d.mask)}
                />
                {d.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Mask actual: {state.daysMask}{state.daysMask === 127 ? ' (todos)' : ''}
          </p>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Hora inicio (24h)" required>
            <input
              type="time"
              required
              value={state.timeStart}
              onChange={(e) => update('timeStart', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Hora fin (24h)" required>
            <input
              type="time"
              required
              value={state.timeEnd}
              onChange={(e) => update('timeEnd', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Si la hora fin es menor que inicio, la ventana cruza medianoche
          (ej. 22:00 → 02:00).
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vigente desde (opcional)">
            <input
              type="date"
              value={state.activeFrom}
              onChange={(e) => update('activeFrom', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Vigente hasta (opcional)">
            <input
              type="date"
              value={state.activeTo}
              onChange={(e) => update('activeTo', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section title={`Productos (${state.productIds.size} seleccionados)`}>
        {productsError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            No se pudieron cargar productos: {productsError}
          </p>
        )}
        {!productsError && products.length === 0 && (
          <p className="text-sm text-muted-foreground">Cargando productos…</p>
        )}
        {products.length > 0 && (
          <div className="grid max-h-80 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border bg-card p-2 sm:grid-cols-2">
            {products.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                  state.productIds.has(p.id)
                    ? 'border-primary bg-destructive/10'
                    : 'border-transparent hover:bg-muted/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={state.productIds.has(p.id)}
                  onChange={() => toggleProduct(p.id)}
                />
                <span className={state.productIds.has(p.id) ? 'font-medium' : ''}>
                  {p.name}
                </span>
                {p.isCombo && (
                  <span className="ml-auto text-xs text-purple-600">combo</span>
                )}
              </label>
            ))}
          </div>
        )}
      </Section>

      {validation.error && state.name.length > 0 && (
        <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-sm text-warning">
          {validation.error}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting || validation.error !== null}>
          {submitting ? 'Creando…' : 'Crear promoción'}
        </Button>
      </div>
    </form>
  );
}

const inputClass =
  'block h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4 rounded-lg border border-border bg-card p-5">
      <legend className="px-2 text-sm font-semibold text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function labelFor(t: PromotionType): string {
  return {
    PERCENT_OFF: 'Descuento %',
    FIXED_OFF: 'Descuento $',
    BOGO: 'BOGO',
    COMBO_OFF: 'Combo',
  }[t];
}

function descriptionFor(t: PromotionType): string {
  return {
    PERCENT_OFF: 'Descuento porcentual sobre la línea (ej. 20% off Hamburguesa).',
    FIXED_OFF: 'Descuento absoluto en COP. Capeado al subtotal de la línea.',
    BOGO: 'Buy X get Y free. Calcula sets completos desde la cantidad de la línea.',
    COMBO_OFF: 'Pct o monto fijo, aplica solo si el producto es un combo.',
  }[t];
}

function validate(s: FormState): { error: string | null } {
  if (s.name.trim().length === 0) return { error: 'Nombre requerido' };
  if ((s.daysMask & 127) === 0) return { error: 'Seleccioná al menos un día' };
  if (s.timeStart === s.timeEnd)
    return { error: 'La hora de inicio y fin no pueden ser iguales' };
  if (s.activeFrom && s.activeTo && s.activeTo < s.activeFrom)
    return { error: 'La fecha "hasta" debe ser >= "desde"' };
  if (s.productIds.size === 0) return { error: 'Seleccioná al menos un producto' };

  switch (s.type) {
    case 'PERCENT_OFF': {
      const pct = Number(s.discountPctPercent);
      if (!Number.isFinite(pct) || pct < 1 || pct >= 100)
        return { error: 'Porcentaje debe estar entre 1 y 99' };
      break;
    }
    case 'FIXED_OFF': {
      const fixed = Number(s.discountFixed);
      if (!Number.isFinite(fixed) || fixed <= 0)
        return { error: 'Monto fijo debe ser > 0' };
      break;
    }
    case 'BOGO': {
      const buy = Number(s.bogoBuyQty);
      const get = Number(s.bogoGetQty);
      if (!Number.isInteger(buy) || buy <= 0)
        return { error: 'Cantidad de compra debe ser entero > 0' };
      if (!Number.isInteger(get) || get <= 0)
        return { error: 'Cantidad gratis debe ser entero > 0' };
      break;
    }
    case 'COMBO_OFF': {
      if (s.comboMode === 'pct') {
        const pct = Number(s.discountPctPercent);
        if (!Number.isFinite(pct) || pct < 1 || pct >= 100)
          return { error: 'Porcentaje del combo debe estar entre 1 y 99' };
      } else {
        const fixed = Number(s.discountFixed);
        if (!Number.isFinite(fixed) || fixed <= 0)
          return { error: 'Monto fijo del combo debe ser > 0' };
      }
      break;
    }
  }
  return { error: null };
}

function buildPayload(s: FormState): CreatePromotion {
  const base = {
    name: s.name.trim(),
    type: s.type,
    daysOfWeekMask: s.daysMask,
    timeStart: `${s.timeStart}:00`,
    timeEnd: `${s.timeEnd}:00`,
    productIds: Array.from(s.productIds),
    ...(s.activeFrom && { activeFrom: s.activeFrom }),
    ...(s.activeTo && { activeTo: s.activeTo }),
  } as const;

  switch (s.type) {
    case 'PERCENT_OFF':
      return { ...base, discountPct: Number(s.discountPctPercent) / 100 };
    case 'FIXED_OFF':
      return { ...base, discountFixed: Number(s.discountFixed) };
    case 'BOGO':
      return {
        ...base,
        bogoBuyQty: Number(s.bogoBuyQty),
        bogoGetQty: Number(s.bogoGetQty),
      };
    case 'COMBO_OFF':
      return s.comboMode === 'pct'
        ? { ...base, discountPct: Number(s.discountPctPercent) / 100 }
        : { ...base, discountFixed: Number(s.discountFixed) };
  }
}
