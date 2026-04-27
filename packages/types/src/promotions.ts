import { z } from 'zod';

// ====================================================================
// PROMOTION TYPES (espejo de Prisma PromotionType)
// ====================================================================

export const PromotionTypeEnum = z.enum([
  'PERCENT_OFF',
  'BOGO',
  'FIXED_OFF',
  'COMBO_OFF',
]);
export type PromotionType = z.infer<typeof PromotionTypeEnum>;

// ====================================================================
// HELPERS
// ====================================================================

/**
 * Bitmask de día de la semana. Lunes=1, Martes=2, ..., Domingo=64.
 * Total = 127 (todos los días).
 */
export const DAY_MASK = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 4,
  THURSDAY: 8,
  FRIDAY: 16,
  SATURDAY: 32,
  SUNDAY: 64,
  ALL: 127,
} as const;

/** Regex HH:MM:SS 24h. Coincide con CHECK constraint en DB. */
const TIME_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
const TimeStringSchema = z.string().regex(TIME_REGEX, 'time must be HH:MM:SS (24h)');

// ====================================================================
// PROMOTION — wire format
// ====================================================================

export const PromotionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: PromotionTypeEnum,
  /** 0..1, ej. 0.20 = 20% off. */
  discountPct: z.number().min(0).lt(1),
  /** Bitmask 1..127. */
  daysOfWeekMask: z.number().int().min(1).max(127),
  timeStart: TimeStringSchema,
  timeEnd: TimeStringSchema,
  activeFrom: z.string().date().nullable(),
  activeTo: z.string().date().nullable(),
  isActive: z.boolean(),
  createdById: z.string().uuid().nullable(),
  createdByName: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  /** IDs de productos a los que aplica (resuelto desde join). */
  productIds: z.array(z.string().uuid()).default([]),
});
export type Promotion = z.infer<typeof PromotionSchema>;

// ====================================================================
// CREATE PROMOTION
// ====================================================================

export const CreatePromotionSchema = z
  .object({
    name: z.string().min(1).max(120),
    type: PromotionTypeEnum.default('PERCENT_OFF'),
    discountPct: z.number().min(0).lt(1),
    daysOfWeekMask: z.number().int().min(1).max(127),
    timeStart: TimeStringSchema,
    timeEnd: TimeStringSchema,
    activeFrom: z.string().date().optional(),
    activeTo: z.string().date().optional(),
    /** Productos a los que aplica. Min 1. */
    productIds: z.array(z.string().uuid()).min(1),
  })
  .superRefine((data, ctx) => {
    // v1 solo soporta PERCENT_OFF
    if (data.type !== 'PERCENT_OFF') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `v1 solo soporta PERCENT_OFF (${data.type} llega en FASE 12)`,
        path: ['type'],
      });
    }
    // active_to debe ser >= active_from
    if (data.activeFrom && data.activeTo && data.activeTo < data.activeFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'activeTo debe ser >= activeFrom',
        path: ['activeTo'],
      });
    }
    // time_start === time_end no tiene sentido (ventana 0)
    if (data.timeStart === data.timeEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'timeStart y timeEnd no pueden ser iguales (ventana 0)',
        path: ['timeEnd'],
      });
    }
  });
export type CreatePromotion = z.infer<typeof CreatePromotionSchema>;

// ====================================================================
// UPDATE PROMOTION
// ====================================================================

export const UpdatePromotionSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    discountPct: z.number().min(0).lt(1).optional(),
    daysOfWeekMask: z.number().int().min(1).max(127).optional(),
    timeStart: TimeStringSchema.optional(),
    timeEnd: TimeStringSchema.optional(),
    activeFrom: z.string().date().nullable().optional(),
    activeTo: z.string().date().nullable().optional(),
    isActive: z.boolean().optional(),
    productIds: z.array(z.string().uuid()).min(1).optional(),
  })
  .strict();
export type UpdatePromotion = z.infer<typeof UpdatePromotionSchema>;
