import { z } from 'zod';

/**
 * Horarios de atención — forma de wire. La LÓGICA (¿está abierto?, ¿cuándo
 * abre?, regla del descanso que se corre por festivo) vive en
 * `@pos-tercos/domain/schedule`, que no se puede importar desde acá (types es
 * la capa de abajo: domain depende de types, no al revés).
 *
 * Los tipos inferidos acá son estructuralmente iguales a las interfaces de
 * domain, así que el compilador valida el encaje en el punto donde el API le
 * pasa la config al motor. Si una de las dos cambia, ahí falla.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Rango en hora local. `end <= start` ⇒ cruza medianoche (ej. 18:00–02:00). */
export const TimeRangeSchema = z
  .object({
    start: z.string().regex(HHMM, 'Usá formato HH:MM (24h).'),
    end: z.string().regex(HHMM, 'Usá formato HH:MM (24h).'),
  })
  .refine((r) => r.start !== r.end, {
    message: 'El inicio y el fin no pueden ser la misma hora.',
  });
export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** Etiquetas para la UI. El índice espeja `Date.getDay()` (0 = domingo). */
export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  sun: 'Domingo',
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
};

/** Tope de rangos por día: cubre almuerzo + noche y frena payloads absurdos. */
const MAX_RANGES_PER_DAY = 4;

const DayRangesSchema = z.array(TimeRangeSchema).max(MAX_RANGES_PER_DAY);

/** Un día sin rangos = cerrado (día de descanso). */
export const WeeklyHoursSchema = z.object({
  sun: DayRangesSchema,
  mon: DayRangesSchema,
  tue: DayRangesSchema,
  wed: DayRangesSchema,
  thu: DayRangesSchema,
  fri: DayRangesSchema,
  sat: DayRangesSchema,
});
export type WeeklyHours = z.infer<typeof WeeklyHoursSchema>;

/** Excepción para una fecha puntual. Le gana al semanal y a la regla de festivos. */
// Sin `.default([])` en `ranges` a propósito: un default hace que el tipo de
// ENTRADA sea opcional y el de SALIDA requerido, y ahí el ZodObject deja de ser
// asignable a `ZodType<DateOverride>` (rompe `request()`/`serverFetchJson`).
// Mismo tropiezo que `PromotionSchema.productIds` en la FASE 12.B.
export const DateOverrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá formato YYYY-MM-DD.'),
  closed: z.boolean(),
  ranges: z.array(TimeRangeSchema).max(MAX_RANGES_PER_DAY),
  note: z.string().trim().max(120).optional(),
});
export type DateOverride = z.infer<typeof DateOverrideSchema>;

/** Tope de excepciones: ~2 meses de fechas puntuales cargadas a mano. */
const MAX_OVERRIDES = 60;

export const OpeningHoursSchema = z.object({
  weekly: WeeklyHoursSchema,
  overrides: z
    .array(DateOverrideSchema)
    .max(MAX_OVERRIDES)
    .refine((list) => new Set(list.map((o) => o.date)).size === list.length, {
      message: 'Hay dos excepciones para la misma fecha.',
    }),
  /**
   * Si el día de descanso cae festivo, se trabaja ese día con el horario del
   * siguiente y el descanso se corre. Es un swap: no hardcodea el lunes.
   */
  restDayHolidayShift: z.boolean(),
});
export type OpeningHours = z.infer<typeof OpeningHoursSchema>;

/** Horario real de TERCOS al 2026-07: cerrado los lunes, 5 pm a 11 pm el resto. */
export const DEFAULT_OPENING_HOURS: OpeningHours = {
  weekly: {
    sun: [{ start: '17:00', end: '23:00' }],
    mon: [],
    tue: [{ start: '17:00', end: '23:00' }],
    wed: [{ start: '17:00', end: '23:00' }],
    thu: [{ start: '17:00', end: '23:00' }],
    fri: [{ start: '17:00', end: '23:00' }],
    sat: [{ start: '17:00', end: '23:00' }],
  },
  overrides: [],
  restDayHolidayShift: true,
};
