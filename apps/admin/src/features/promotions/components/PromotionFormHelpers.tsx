/** Shared primitives used by PromotionForm sub-components. */
import type { PromotionChannel, PromotionType } from '@pos-tercos/types';

export const inputClass =
  'block h-10 w-full rounded-md border border-input bg-card px-3 text-base sm:text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring';

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
    FIXED_PRICE: 'Precio fijo',
  }[t];
}

export const CHANNEL_OPTIONS: {
  value: PromotionChannel;
  label: string;
  description: string;
}[] = [
  { value: 'BOTH', label: 'Caja y web', description: 'Aplica en el POS y en los pedidos online.' },
  { value: 'POS', label: 'Solo caja', description: 'Solo en ventas del mostrador (POS).' },
  { value: 'WEB', label: 'Solo web', description: 'Solo en pedidos de la página web.' },
];

export function channelLabel(c: PromotionChannel): string {
  return CHANNEL_OPTIONS.find((o) => o.value === c)?.label ?? c;
}

export function descriptionFor(t: PromotionType): string {
  return {
    PERCENT_OFF: 'Descuento porcentual sobre el producto (ej. 20% en la Hamburguesa).',
    FIXED_OFF:
      'Monto fijo POR CADA UNIDAD: $2.000 en hamburguesas son $6.000 si el cliente lleva tres. Nunca baja del precio del producto. Para descontar del pedido completo, usa el descuento manual en la caja.',
    COMBO_OFF:
      'Porcentaje o monto fijo; aplica solo si el producto es un combo. El monto fijo también es por cada unidad.',
    BOGO: 'Lleva X y paga Y. Calcula los juegos completos según la cantidad comprada.',
    FIXED_PRICE:
      'El producto se vende a ESE precio mientras dura la promo, sin importar su precio de carta. Es el precio del producto con su tamaño: los extras se suman encima. Si el producto ya es más barato, la promo no hace nada.',
  }[t];
}

export interface FormState {
  name: string;
  type: PromotionType;
  channel: PromotionChannel;
  discountPctPercent: string;
  discountFixed: string;
  bogoBuyQty: string;
  bogoGetQty: string;
  comboMode: 'pct' | 'fixed';
  /** FIXED_PRICE: precio de venta, como texto del MoneyInput. */
  fixedPrice: string;
  daysMask: number;
  timeStart: string;
  timeEnd: string;
  activeFrom: string;
  activeTo: string;
  productIds: Set<string>;
  /** Productos limitados a ciertas variantes. Sin entrada = todas sus variantes. */
  sizeIdsByProduct: Record<string, string[]>;
}

export function validate(s: FormState): { error: string | null } {
  if (s.name.trim().length === 0) return { error: 'Nombre requerido' };
  if ((s.daysMask & 127) === 0) return { error: 'Selecciona al menos un día' };
  if (s.timeStart === s.timeEnd)
    return { error: 'La hora de inicio y fin no pueden ser iguales' };
  if (s.activeFrom && s.activeTo && s.activeTo < s.activeFrom)
    return { error: 'La fecha "hasta" debe ser >= "desde"' };
  if (s.productIds.size === 0) return { error: 'Selecciona al menos un producto' };

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
    case 'FIXED_PRICE': {
      const price = Number(s.fixedPrice);
      if (!Number.isFinite(price) || price <= 0)
        return { error: 'Escribe el precio al que se va a vender' };
      break;
    }
  }
  // Un producto "limitado" a cero variantes no aplicaría a nada: o se eligen
  // variantes o se deja en "todas".
  for (const [pid, sizeIds] of Object.entries(s.sizeIdsByProduct)) {
    if (s.productIds.has(pid) && sizeIds.length === 0)
      return { error: 'Elige al menos una variante o deja "Todas las variantes"' };
  }
  return { error: null };
}

export { stateFromPromotion, buildUpdatePayload, buildPayload } from '../lib/form-payload';
