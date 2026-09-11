import {
  matchesDayOfWeek,
  parseTimeToSeconds,
  withinTimeWindow,
} from '../promotions/apply-promotions';

/**
 * Una franja en la que el producto SÍ se vende. `timeStart`/`timeEnd` en null
 * = todo el día (ver por qué en `ProductAvailabilityWindowSchema`).
 */
export interface ProductAvailabilityWindow {
  daysOfWeekMask: number;
  timeStart: string | null;
  timeEnd: string | null;
}

export interface ProductScheduleState {
  /** ¿Se puede vender AHORA? Sin ventanas: siempre sí. */
  availableNow: boolean;
  /** Próximo momento en que se puede vender. null si ya se puede o si nunca. */
  nextStart: Date | null;
}

/** Un año cubre cualquier máscara semanal. */
const MAX_LOOKAHEAD_DAYS = 371;

/**
 * ¿El producto se puede vender en `at`, según su horario?
 *
 * Un producto SIN ventanas se vende siempre — es como se comporta todo el
 * catálogo hoy, y es lo que hace que agregar esto no cambie nada de lo que ya
 * funciona. Con ventanas, basta que UNA calce ("miércoles todo el día" O
 * "sábado de 6 a 11").
 *
 * Función PURA. `at` tiene que venir en hora de PARED del local
 * (`businessWallClock`): decide con el calendario, y el runtime de Vercel
 * corre en UTC (§7.v52).
 *
 * Reusa `matchesDayOfWeek` y `withinTimeWindow` del motor de promociones a
 * propósito: es la misma pregunta —¿esta franja cubre este instante?— y dos
 * implementaciones de la misma regla terminan separándose.
 */
export function productScheduleState(
  windows: readonly ProductAvailabilityWindow[],
  at: Date,
): ProductScheduleState {
  if (windows.length === 0) return { availableNow: true, nextStart: null };
  if (windows.some((w) => cubre(w, at))) return { availableNow: true, nextStart: null };
  return { availableNow: false, nextStart: proximoArranque(windows, at) };
}

function cubre(w: ProductAvailabilityWindow, at: Date): boolean {
  if (!matchesDayOfWeek(w.daysOfWeekMask, at)) return false;
  if (w.timeStart === null || w.timeEnd === null) return true; // todo el día
  return withinTimeWindow(w.timeStart, w.timeEnd, at);
}

/**
 * El arranque más cercano entre todas las ventanas. Se recorre día por día
 * porque la máscara semanal no tiene forma cerrada; un año de enteros no se
 * nota. Mismo enfoque que `promotionScheduleState`.
 */
function proximoArranque(
  windows: readonly ProductAvailabilityWindow[],
  at: Date,
): Date | null {
  let mejor: Date | null = null;
  for (const w of windows) {
    const segundos = w.timeStart === null ? 0 : parseTimeToSeconds(w.timeStart);
    for (let offset = 0; offset <= MAX_LOOKAHEAD_DAYS; offset += 1) {
      const dia = new Date(at.getFullYear(), at.getMonth(), at.getDate() + offset);
      if (!matchesDayOfWeek(w.daysOfWeekMask, dia)) continue;
      const arranque = new Date(
        dia.getFullYear(),
        dia.getMonth(),
        dia.getDate(),
        0,
        0,
        segundos,
      );
      if (arranque.getTime() <= at.getTime()) continue;
      if (mejor === null || arranque.getTime() < mejor.getTime()) mejor = arranque;
      break;
    }
  }
  return mejor;
}

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const BITS = [1, 2, 4, 8, 16, 32, 64];

/** "miércoles" · "miércoles y sábados" · "lunes, martes y viernes". */
export function nombreDeDias(mask: number): string {
  const dias = DIAS.filter((_, i) => (mask & BITS[i]) !== 0);
  if (dias.length === 0) return 'ningún día';
  if (dias.length === 7) return 'todos los días';
  if (dias.length === 1) return dias[0];
  return `${dias.slice(0, -1).join(', ')} y ${dias[dias.length - 1]}`;
}

/**
 * El motivo que ve la persona. NO dice "Agotado": el producto no se acabó,
 * hoy no se vende. Reusar ese cartel mentiría sobre la causa (§7.v26).
 */
export function motivoDeHorario(
  windows: readonly ProductAvailabilityWindow[],
): string {
  const masks = windows.reduce((acc, w) => acc | w.daysOfWeekMask, 0);
  const todoElDia = windows.every((w) => w.timeStart === null);
  const dias = nombreDeDias(masks);
  return todoElDia ? `Solo ${dias}` : `Fuera de horario (solo ${dias})`;
}
