/** Del estado del formulario al payload del API (y de vuelta, en edición). */
import type {
  CreatePromotion,
  Promotion,
  PromotionSizeIdsByProduct,
  UpdatePromotion,
} from '@pos-tercos/types';
import type { FormState } from '../components/PromotionFormHelpers';

/** Solo las limitaciones de productos que siguen en la promo y con variantes. */
function limitacionesVigentes(s: FormState): PromotionSizeIdsByProduct | undefined {
  const out: PromotionSizeIdsByProduct = {};
  for (const [pid, sizeIds] of Object.entries(s.sizeIdsByProduct)) {
    if (s.productIds.has(pid) && sizeIds.length > 0) out[pid] = sizeIds;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Pre-llena el form desde una promo existente (modo edición). */
export function stateFromPromotion(p: Promotion): FormState {
  const pctStr = p.discountPct !== null ? String(Math.round(p.discountPct * 100)) : '';
  const fixedStr = p.discountFixed !== null ? String(p.discountFixed) : '';
  return {
    name: p.name,
    type: p.type,
    channel: p.channel,
    discountPctPercent: pctStr,
    discountFixed: fixedStr,
    bogoBuyQty: p.bogoBuyQty !== null ? String(p.bogoBuyQty) : '1',
    bogoGetQty: p.bogoGetQty !== null ? String(p.bogoGetQty) : '1',
    comboMode: p.discountFixed !== null ? 'fixed' : 'pct',
    fixedPrice: p.fixedPrice != null ? String(p.fixedPrice) : '',
    daysMask: p.daysOfWeekMask,
    timeStart: p.timeStart.slice(0, 5),
    timeEnd: p.timeEnd.slice(0, 5),
    activeFrom: p.activeFrom ?? '',
    activeTo: p.activeTo ?? '',
    productIds: new Set(p.productIds),
    sizeIdsByProduct: { ...(p.sizeIdsByProduct ?? {}) },
  };
}

/** Payload de edición (UpdatePromotion). Solo campos editables — el backend rechaza los demás. */
export function buildUpdatePayload(s: FormState): UpdatePromotion {
  return {
    name: s.name.trim(),
    channel: s.channel,
    daysOfWeekMask: s.daysMask,
    timeStart: `${s.timeStart}:00`,
    timeEnd: `${s.timeEnd}:00`,
    activeFrom: s.activeFrom ? s.activeFrom : null,
    activeTo: s.activeTo ? s.activeTo : null,
    productIds: Array.from(s.productIds),
    ...(limitacionesVigentes(s) && { sizeIdsByProduct: limitacionesVigentes(s) }),
  };
}

export function buildPayload(s: FormState): CreatePromotion {
  const base = {
    name: s.name.trim(),
    type: s.type,
    channel: s.channel,
    daysOfWeekMask: s.daysMask,
    timeStart: `${s.timeStart}:00`,
    timeEnd: `${s.timeEnd}:00`,
    productIds: Array.from(s.productIds),
    ...(s.activeFrom && { activeFrom: s.activeFrom }),
    ...(s.activeTo && { activeTo: s.activeTo }),
    ...(limitacionesVigentes(s) && { sizeIdsByProduct: limitacionesVigentes(s) }),
  } as const;

  switch (s.type) {
    case 'PERCENT_OFF':
      return { ...base, discountPct: Number(s.discountPctPercent) / 100 };
    case 'FIXED_OFF':
      return { ...base, discountFixed: Number(s.discountFixed) };
    case 'FIXED_PRICE':
      return { ...base, fixedPrice: Number(s.fixedPrice) };
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
