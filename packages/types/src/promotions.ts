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
  /** 0..1, ej. 0.20 = 20% off. Required en PERCENT_OFF, opcional en COMBO_OFF. */
  discountPct: z.number().min(0).lt(1).nullable(),
  /** Monto absoluto en COP. Required en FIXED_OFF, opcional en COMBO_OFF. */
  discountFixed: z.number().min(0).nullable(),
  /** BOGO: cantidad de ítems que paga el cliente por cada "set". */
  bogoBuyQty: z.number().int().min(1).nullable(),
  /** BOGO: cantidad de ítems gratis por cada "set" (típico 1). */
  bogoGetQty: z.number().int().min(1).nullable(),
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
  productIds: z.array(z.string().uuid()),
});
export type Promotion = z.infer<typeof PromotionSchema>;

// ====================================================================
// CREATE PROMOTION
// ====================================================================

export const CreatePromotionSchema = z
  .object({
    name: z.string().min(1).max(120),
    type: PromotionTypeEnum.default('PERCENT_OFF'),
    /** Required en PERCENT_OFF; opcional en COMBO_OFF; prohibido en otros. */
    discountPct: z.number().min(0).lt(1).optional(),
    /** Required en FIXED_OFF; opcional en COMBO_OFF; prohibido en otros. */
    discountFixed: z.number().min(0).optional(),
    /** Required en BOGO; prohibido en otros. */
    bogoBuyQty: z.number().int().min(1).optional(),
    /** Required en BOGO; prohibido en otros. */
    bogoGetQty: z.number().int().min(1).optional(),
    daysOfWeekMask: z.number().int().min(1).max(127),
    timeStart: TimeStringSchema,
    timeEnd: TimeStringSchema,
    activeFrom: z.string().date().optional(),
    activeTo: z.string().date().optional(),
    /** Productos a los que aplica. Min 1. */
    productIds: z.array(z.string().uuid()).min(1),
  })
  .superRefine((data, ctx) => {
    // Validación per-type. Espeja CHECK constraints en DB
    // (chk_promo_pct/fixed/bogo/combo).
    switch (data.type) {
      case 'PERCENT_OFF': {
        if (data.discountPct === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'discountPct requerido para PERCENT_OFF',
            path: ['discountPct'],
          });
        }
        rejectField(ctx, data, 'discountFixed', 'PERCENT_OFF');
        rejectField(ctx, data, 'bogoBuyQty', 'PERCENT_OFF');
        rejectField(ctx, data, 'bogoGetQty', 'PERCENT_OFF');
        break;
      }
      case 'FIXED_OFF': {
        if (data.discountFixed === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'discountFixed requerido para FIXED_OFF',
            path: ['discountFixed'],
          });
        }
        rejectField(ctx, data, 'discountPct', 'FIXED_OFF');
        rejectField(ctx, data, 'bogoBuyQty', 'FIXED_OFF');
        rejectField(ctx, data, 'bogoGetQty', 'FIXED_OFF');
        break;
      }
      case 'BOGO': {
        if (data.bogoBuyQty === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'bogoBuyQty requerido para BOGO',
            path: ['bogoBuyQty'],
          });
        }
        if (data.bogoGetQty === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'bogoGetQty requerido para BOGO',
            path: ['bogoGetQty'],
          });
        }
        rejectField(ctx, data, 'discountPct', 'BOGO');
        rejectField(ctx, data, 'discountFixed', 'BOGO');
        break;
      }
      case 'COMBO_OFF': {
        const hasPct = data.discountPct !== undefined;
        const hasFixed = data.discountFixed !== undefined;
        if (hasPct === hasFixed) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'COMBO_OFF requiere exactamente uno: discountPct O discountFixed (no ambos, no ninguno)',
            path: ['type'],
          });
        }
        rejectField(ctx, data, 'bogoBuyQty', 'COMBO_OFF');
        rejectField(ctx, data, 'bogoGetQty', 'COMBO_OFF');
        break;
      }
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

function rejectField(
  ctx: z.RefinementCtx,
  data: Record<string, unknown>,
  field: 'discountPct' | 'discountFixed' | 'bogoBuyQty' | 'bogoGetQty',
  forType: PromotionType,
): void {
  if (data[field] !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${field} no aplica para ${forType}`,
      path: [field],
    });
  }
}

// ====================================================================
// UPDATE PROMOTION
// ====================================================================

/**
 * Update parcial: solo permite tocar campos que NO cambian de validación
 * per-type. Para cambiar `type`, `discountPct`, `discountFixed`, `bogoBuyQty`
 * o `bogoGetQty` el dueño debe desactivar la promo (`isActive=false`) y
 * crear una nueva. Mantiene la invariante de tipo a nivel CHECK constraint
 * sin tener que re-validar todos los XOR en update.
 */
export const UpdatePromotionSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
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
