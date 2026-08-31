import { promotionScheduleState } from '@pos-tercos/domain';
import type { Promotion } from '@pos-tercos/types';
import { businessWallClock } from '@pos-tercos/types';
import { BUSINESS_TIME_ZONE } from '@pos-tercos/ui';

/**
 * Estado de una promoción tal como lo lee una persona.
 *
 * Existe porque la pantalla decía "Activa" mirando solo el flag `isActive`, y
 * eso no responde la única pregunta que importa: ¿está descontando o no? Una
 * promo podía verse Activa toda la semana con su día apagado en la máscara y
 * no descontar un peso, sin una sola pista en la interfaz.
 */
export interface PromotionStatus {
  label: string;
  tone: 'success' | 'warning' | 'neutral' | 'danger';
  /** Frase completa para el detalle y el formulario. Vacía si no aporta nada. */
  hint: string;
}

/** Lo mínimo para saber cuándo aplica. Lo cumple `Promotion` y el form al vuelo. */
export type PromotionStatusInput = Pick<
  Promotion,
  'isActive' | 'daysOfWeekMask' | 'timeStart' | 'timeEnd' | 'activeFrom' | 'activeTo'
>;

/**
 * `at` por defecto es la hora del LOCAL, no la del runtime: esta pantalla se
 * arma en el servidor (Vercel corre en UTC) y con el reloj corrido 5 horas una
 * promo de viernes por la noche se evaluaba contra la franja del sábado.
 */
export function promotionStatus(
  p: PromotionStatusInput,
  at: Date = businessWallClock(),
): PromotionStatus {
  if (!p.isActive) {
    return {
      label: 'Apagada',
      tone: 'neutral',
      hint: 'No descuenta nada. Puedes volver a encenderla cuando quieras.',
    };
  }

  const state = promotionScheduleState(
    {
      daysOfWeekMask: p.daysOfWeekMask,
      timeStart: p.timeStart,
      timeEnd: p.timeEnd,
      activeFrom: p.activeFrom,
      activeTo: p.activeTo,
    },
    at,
  );
  const vuelve = state.nextStart ? ` Vuelve ${momentText(state.nextStart, at)}.` : '';

  switch (state.reason) {
    case 'applies':
      return {
        label: 'Descontando ahora',
        tone: 'success',
        hint: 'Ahora mismo le está bajando el precio a sus productos.',
      };
    case 'not_started':
      return {
        label: 'Programada',
        tone: 'warning',
        hint: state.nextStart
          ? `Todavía no empieza: arranca ${momentText(state.nextStart, at)}.`
          : 'Todavía no empieza.',
      };
    case 'expired':
      return {
        label: 'Vencida',
        tone: 'neutral',
        hint: `Su vigencia terminó el ${p.activeTo ?? '—'}. Para volver a usarla, cambia la fecha "vigente hasta".`,
      };
    case 'day_off':
      return {
        label: 'Hoy no aplica',
        tone: 'warning',
        hint: `Hoy es ${dayName(at)} y ese día está apagado en sus días de la semana.${vuelve}`,
      };
    case 'outside_hours':
      return {
        label: 'Fuera de horario',
        tone: 'warning',
        hint: `Hoy sí es su día, pero solo aplica de ${hhmm(p.timeStart)} a ${hhmm(p.timeEnd)}.${vuelve}`,
      };
    case 'never':
      return {
        label: 'Sin horario válido',
        tone: 'danger',
        hint: 'La hora de inicio y la de fin son iguales, así que nunca llega a aplicar.',
      };
  }
}

const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

function dayName(d: Date): string {
  return DAY_NAMES[d.getDay()]!;
}

/** `HH:MM:SS` → `HH:MM` (los segundos no le dicen nada a nadie). */
function hhmm(t: string): string {
  return t.slice(0, 5);
}

/**
 * "hoy a las 17:00" · "mañana a las 17:00" · "el lunes 31 de agosto a las 17:00".
 * Se prefiere el día relativo hasta mañana: es como se habla de un horario.
 */
function momentText(target: Date, at: Date): string {
  const hora = `a las ${String(target.getHours()).padStart(2, '0')}:${String(
    target.getMinutes(),
  ).padStart(2, '0')}`;
  const diff = daysApart(at, target);
  if (diff === 0) return `hoy ${hora}`;
  if (diff === 1) return `mañana ${hora}`;
  const fecha = target.toLocaleDateString('es-CO', {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return `el ${fecha} ${hora}`;
}

/** Días calendario locales entre dos instantes (ignora la hora). */
function daysApart(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}
