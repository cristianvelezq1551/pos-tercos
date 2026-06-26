import { roundMoney } from '../common/money';
import {
  DAY_BIT,
  type ApplyPromotionInput,
  type ApplyPromotionOutput,
  type PromotionDef,
} from './types';

const NO_PROMOTION: ApplyPromotionOutput = {
  appliedPromotionId: null,
  lineDiscount: 0,
};

/**
 * Aplica la mejor promoción disponible al item.
 *
 * Reglas (architecture.md §3.4):
 *   1. Filtrar promociones que matcheen `(productId, day-of-week, time-window,
 *      active-date-range, type-specific-rules)`.
 *   2. De las matching, elegir la de **mayor descuento ABSOLUTO en COP**.
 *      (Antes era por discountPct, pero con types mixtos pct vs fixed
 *      vs bogo, comparar el monto resuelto es la única forma justa.)
 *   3. NO acumulables: si hay 2 promos al mismo descuento, gana la primera
 *      por id (tiebreaker estable para idempotencia).
 *
 * Función pura: no IO, no logs, no efectos secundarios.
 *
 * @param input  Item a evaluar (productId, lineSubtotal, quantity, isCombo, momento).
 * @param activePromotions  Set de promociones candidatas (típicamente las que
 *   están `is_active=true` ese día). El motor filtra por matching adicional.
 */
export function applyPromotion(
  input: ApplyPromotionInput,
  activePromotions: readonly PromotionDef[],
): ApplyPromotionOutput {
  if (activePromotions.length === 0) return NO_PROMOTION;

  // Compute the discount amount for each matching promo.
  type Candidate = { promo: PromotionDef; discount: number };
  const candidates: Candidate[] = [];
  for (const promo of activePromotions) {
    if (!promoMatches(promo, input)) continue;
    const discount = computeLineDiscount(promo, input);
    if (discount <= 0) continue;
    candidates.push({ promo, discount });
  }
  if (candidates.length === 0) return NO_PROMOTION;

  // Mayor discount absoluto gana. Tiebreaker: id ascendente (estable).
  const winner = candidates.reduce((best, c) => {
    if (c.discount > best.discount) return c;
    if (c.discount === best.discount && c.promo.id < best.promo.id) return c;
    return best;
  });

  return {
    appliedPromotionId: winner.promo.id,
    lineDiscount: roundMoney(winner.discount),
  };
}

/**
 * Calcula el monto del descuento que la promoción aplicaría a esta línea.
 * Devuelve 0 si el tipo no tiene los datos requeridos (defensivo).
 */
function computeLineDiscount(
  promo: PromotionDef,
  input: ApplyPromotionInput,
): number {
  switch (promo.type) {
    case 'PERCENT_OFF': {
      if (promo.discountPct === undefined || promo.discountPct <= 0) return 0;
      // Cap defensivo: con pct válido (≤1) es no-op; protege de lineTotal
      // negativo si llegara un discountPct corrupto > 1.
      return Math.min(input.lineSubtotal * promo.discountPct, input.lineSubtotal);
    }
    case 'FIXED_OFF': {
      if (promo.discountFixed === undefined || promo.discountFixed <= 0) return 0;
      // Cap: nunca descontamos más que el subtotal (evita lineTotal negativo).
      return Math.min(promo.discountFixed, input.lineSubtotal);
    }
    case 'BOGO': {
      if (
        promo.bogoBuyQty === undefined ||
        promo.bogoGetQty === undefined ||
        promo.bogoBuyQty <= 0 ||
        promo.bogoGetQty <= 0
      ) {
        return 0;
      }
      // Cada "set" = bogoBuyQty paid + bogoGetQty free. Calculamos cuántos
      // sets completos caben en la cantidad y aplicamos el descuento por
      // las unidades gratis.
      const setSize = promo.bogoBuyQty + promo.bogoGetQty;
      if (input.quantity < setSize) return 0;
      const completeSets = Math.floor(input.quantity / setSize);
      const freeUnits = completeSets * promo.bogoGetQty;
      const unitPrice = input.lineSubtotal / input.quantity;
      // Cap defensivo: con datos válidos freeUnits < quantity (es no-op);
      // protege de lineTotal negativo ante quantity/lineSubtotal inconsistentes.
      return Math.min(freeUnits * unitPrice, input.lineSubtotal);
    }
    case 'COMBO_OFF': {
      // Solo aplica si la línea es de un combo. El llamador setea isCombo.
      if (!input.isCombo) return 0;
      // Acepta pct o fixed; si ambos están definidos, gana el que produce
      // mayor descuento (pero el creador del schema NO debería setear
      // ambos; FASE 12.B Zod validará uno xor otro).
      const pctDiscount =
        promo.discountPct !== undefined && promo.discountPct > 0
          ? input.lineSubtotal * promo.discountPct
          : 0;
      const fixedDiscount =
        promo.discountFixed !== undefined && promo.discountFixed > 0
          ? Math.min(promo.discountFixed, input.lineSubtotal)
          : 0;
      return Math.max(pctDiscount, fixedDiscount);
    }
    default: {
      const _exhaustive: never = promo.type;
      void _exhaustive;
      return 0;
    }
  }
}

function promoMatches(p: PromotionDef, input: ApplyPromotionInput): boolean {
  if (!p.productIds.has(input.productId)) return false;
  if (!withinActiveDates(p, input.at)) return false;
  if (!matchesDayOfWeek(p.daysOfWeekMask, input.at)) return false;
  if (!withinTimeWindow(p.timeStart, p.timeEnd, input.at)) return false;
  return true;
}

function withinActiveDates(p: PromotionDef, at: Date): boolean {
  // Comparar a nivel de día (ignorar hora para activeFrom/activeTo).
  const dayKey = startOfDay(at).getTime();
  if (p.activeFrom && dayKey < startOfDay(p.activeFrom).getTime()) return false;
  if (p.activeTo && dayKey > startOfDay(p.activeTo).getTime()) return false;
  return true;
}

/**
 * Día de la semana ISO: lunes=1, ..., domingo=7. Convertimos al bitmask
 * usado en DB (lunes=bit0=1, ..., domingo=bit6=64).
 */
export function getDayOfWeekBit(at: Date): number {
  // Date.getDay(): domingo=0, lunes=1, ..., sábado=6
  const jsDay = at.getDay();
  switch (jsDay) {
    case 0: return DAY_BIT.SUNDAY;
    case 1: return DAY_BIT.MONDAY;
    case 2: return DAY_BIT.TUESDAY;
    case 3: return DAY_BIT.WEDNESDAY;
    case 4: return DAY_BIT.THURSDAY;
    case 5: return DAY_BIT.FRIDAY;
    case 6: return DAY_BIT.SATURDAY;
    default:
      throw new Error(`Invalid day of week: ${jsDay}`);
  }
}

function matchesDayOfWeek(mask: number, at: Date): boolean {
  const bit = getDayOfWeekBit(at);
  return (mask & bit) !== 0;
}

/**
 * ¿`at` está dentro de la ventana `[start, end)` en horario local?
 *
 * Maneja el caso de cruce de medianoche: si `start > end` (ej. 22:00..02:00),
 * la ventana cubre `[start, 24:00) ∪ [00:00, end)`.
 *
 * Edge case: el servicio rechaza `start === end` en CreatePromotionSchema,
 * pero aquí lo tratamos como ventana vacía por defensividad.
 */
export function withinTimeWindow(
  startStr: string,
  endStr: string,
  at: Date,
): boolean {
  if (startStr === endStr) return false;
  const now = timeAsSeconds(at.getHours(), at.getMinutes(), at.getSeconds());
  const start = parseTimeToSeconds(startStr);
  const end = parseTimeToSeconds(endStr);

  if (start < end) {
    // Ventana normal: [start, end)
    return now >= start && now < end;
  }
  // Cruce de medianoche: [start, 24h) ∪ [00:00, end)
  return now >= start || now < end;
}

function parseTimeToSeconds(t: string): number {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])$/.exec(t);
  if (!m) {
    throw new Error(`Invalid HH:MM:SS time: "${t}"`);
  }
  return timeAsSeconds(Number(m[1]), Number(m[2]), Number(m[3]));
}

function timeAsSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

