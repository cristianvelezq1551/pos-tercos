/** Shared primitives used by PromotionForm sub-components. */
import type { PromotionType, CreatePromotion, Promotion, UpdatePromotion } from '@pos-tercos/types';

export const inputClass =
  'block h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring';

export function Section({
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

export function Field({
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

export function labelFor(t: PromotionType): string {
  return {
    PERCENT_OFF: 'Descuento %',
    FIXED_OFF: 'Descuento $',
    BOGO: 'Lleva X paga Y',
    COMBO_OFF: 'Combo',
  }[t];
}

export function descriptionFor(t: PromotionType): string {
  return {
    PERCENT_OFF: 'Descuento porcentual sobre el producto (ej. 20% en la Hamburguesa).',
    FIXED_OFF: 'Descuento de un monto fijo en pesos. No baja del subtotal del producto.',
    COMBO_OFF: 'Porcentaje o monto fijo; aplica solo si el producto es un combo.',
    BOGO: 'Lleva X y paga Y. Calcula los juegos completos según la cantidad comprada.',
  }[t];
}

export interface FormState {
  name: string;
  type: PromotionType;
  discountPctPercent: string;
  discountFixed: string;
  bogoBuyQty: string;
  bogoGetQty: string;
  comboMode: 'pct' | 'fixed';
  daysMask: number;
  timeStart: string;
  timeEnd: string;
  activeFrom: string;
  activeTo: string;
  productIds: Set<string>;
}

export function validate(s: FormState): { error: string | null } {
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

/** Pre-llena el form desde una promo existente (modo edición). */
export function stateFromPromotion(p: Promotion): FormState {
  const pctStr = p.discountPct !== null ? String(Math.round(p.discountPct * 100)) : '';
  const fixedStr = p.discountFixed !== null ? String(p.discountFixed) : '';
  return {
    name: p.name,
    type: p.type,
    discountPctPercent: pctStr,
    discountFixed: fixedStr,
    bogoBuyQty: p.bogoBuyQty !== null ? String(p.bogoBuyQty) : '1',
    bogoGetQty: p.bogoGetQty !== null ? String(p.bogoGetQty) : '1',
    comboMode: p.discountFixed !== null ? 'fixed' : 'pct',
    daysMask: p.daysOfWeekMask,
    timeStart: p.timeStart.slice(0, 5),
    timeEnd: p.timeEnd.slice(0, 5),
    activeFrom: p.activeFrom ?? '',
    activeTo: p.activeTo ?? '',
    productIds: new Set(p.productIds),
  };
}

/** Payload de edición (UpdatePromotion). Solo campos editables — el backend rechaza los demás. */
export function buildUpdatePayload(s: FormState): UpdatePromotion {
  return {
    name: s.name.trim(),
    daysOfWeekMask: s.daysMask,
    timeStart: `${s.timeStart}:00`,
    timeEnd: `${s.timeEnd}:00`,
    activeFrom: s.activeFrom ? s.activeFrom : null,
    activeTo: s.activeTo ? s.activeTo : null,
    productIds: Array.from(s.productIds),
  };
}

export function buildPayload(s: FormState): CreatePromotion {
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
