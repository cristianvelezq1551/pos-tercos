import {
  matchesDayOfWeek,
  parseTimeToSeconds,
  withinActiveDates,
  withinTimeWindow,
  ymdLocal,
} from './apply-promotions';
import type { PromotionSchedule } from './types';

/**
 * Por qué una promoción aplica —o no— en un momento dado. Cada motivo es
 * accionable: dice qué habría que cambiar para que aplique.
 */
export type PromotionScheduleReason =
  | 'applies'
  | 'not_started'
  | 'expired'
  | 'day_off'
  | 'outside_hours'
  | 'never';

export interface PromotionScheduleState {
  /** ¿El motor de cobro le daría descuento a este producto ahora mismo? */
  appliesNow: boolean;
  reason: PromotionScheduleReason;
  /**
   * Próximo instante en que empieza a aplicar, o null si ya aplica, si venció
   * o si su configuración no la deja aplicar nunca.
   */
  nextStart: Date | null;
}

/** Un año cubre cualquier máscara semanal y cualquier `activeFrom` razonable. */
const MAX_LOOKAHEAD_DAYS = 371;

/**
 * Estado de una promoción en `at`, con las MISMAS reglas que usa el cobro
 * (`applyPromotion`): vigencia, día de la semana y franja horaria.
 *
 * Existe porque "activa" (el flag `isActive`) y "aplicando" son cosas distintas
 * y la pantalla las mostraba como una sola: una promo podía verse Activa toda
 * la semana y no descontar un peso porque su día estaba apagado. Esto lo dice.
 *
 * Función pura. No mira el producto: responde solo por el CUÁNDO.
 */
export function promotionScheduleState(
  schedule: PromotionSchedule,
  at: Date,
): PromotionScheduleState {
  const reason = scheduleReason(schedule, at);
  if (reason === 'applies') {
    return { appliesNow: true, reason, nextStart: null };
  }
  if (reason === 'expired' || reason === 'never') {
    return { appliesNow: false, reason, nextStart: null };
  }
  return { appliesNow: false, reason, nextStart: findNextStart(schedule, at) };
}

function scheduleReason(s: PromotionSchedule, at: Date): PromotionScheduleReason {
  // Ventana vacía (inicio === fin): el motor la trata como "nunca". El form la
  // rechaza, pero una promo vieja o un POST directo pueden traerla.
  if (s.timeStart === s.timeEnd) return 'never';
  const today = ymdLocal(at);
  if (s.activeFrom && today < s.activeFrom) return 'not_started';
  if (s.activeTo && today > s.activeTo) return 'expired';
  if (!matchesDayOfWeek(s.daysOfWeekMask, at)) return 'day_off';
  if (!withinTimeWindow(s.timeStart, s.timeEnd, at)) return 'outside_hours';
  return 'applies';
}

/**
 * Primer arranque de la franja posterior a `at`. Recorre día por día porque la
 * combinación de máscara semanal + rango de fechas no tiene forma cerrada, y un
 * año de iteraciones sobre enteros no se nota.
 */
function findNextStart(s: PromotionSchedule, at: Date): Date | null {
  const startSeconds = parseTimeToSeconds(s.timeStart);
  for (let offset = 0; offset <= MAX_LOOKAHEAD_DAYS; offset += 1) {
    const day = new Date(at.getFullYear(), at.getMonth(), at.getDate() + offset);
    if (s.activeTo && ymdLocal(day) > s.activeTo) return null;
    if (!withinActiveDates(s, day)) continue;
    if (!matchesDayOfWeek(s.daysOfWeekMask, day)) continue;
    // `new Date(y, m, d, 0, 0, segundos)` normaliza los segundos a hora local.
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, startSeconds);
    if (start.getTime() > at.getTime()) return start;
  }
  return null;
}
