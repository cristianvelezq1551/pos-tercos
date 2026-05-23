import { z } from 'zod';

// ====================================================================
// SHIFT (turno de caja) — FASE 5 cubre solo apertura
// ====================================================================

export const ShiftStatusEnum = z.enum(['OPEN', 'CLOSED', 'RECONCILED']);
export type ShiftStatus = z.infer<typeof ShiftStatusEnum>;

export const ShiftSchema = z.object({
  id: z.string().uuid(),
  cashierId: z.string().uuid(),
  cashierName: z.string().nullable().optional(),
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  openingCash: z.number().nonnegative(),
  expectedCash: z.number().nonnegative().nullable(),
  countedCash: z.number().nonnegative().nullable(),
  /** counted - expected. Negativo = falta plata, positivo = sobra. */
  difference: z.number().nullable(),
  notes: z.string().nullable(),
  status: ShiftStatusEnum,
});
export type Shift = z.infer<typeof ShiftSchema>;

// ====================================================================
// OPEN SHIFT — POST /shifts/open
// ====================================================================

export const OpenShiftSchema = z.object({
  /** Plata inicial en caja al abrir turno (efectivo). */
  openingCash: z.number().nonnegative(),
  notes: z.string().max(200).optional(),
});
export type OpenShift = z.infer<typeof OpenShiftSchema>;

// ====================================================================
// CLOSE SHIFT — POST /shifts/:id/close (FASE 11, schema definido ya)
// ====================================================================

/** Arqueo por denominación: cuántas piezas de cada valor (billete/moneda). */
export const CashCountLineSchema = z.object({
  denomination: z.number().int().positive(),
  count: z.number().int().nonnegative(),
});
export type CashCountLine = z.infer<typeof CashCountLineSchema>;

export const CloseShiftSchema = z.object({
  /** Efectivo contado físicamente al cerrar (suma del arqueo si se usa). */
  countedCash: z.number().nonnegative(),
  /** Desglose por denominación (arqueo). Opcional; queda para auditoría. */
  breakdown: z.array(CashCountLineSchema).optional(),
  notes: z.string().max(500).optional(),
});
export type CloseShift = z.infer<typeof CloseShiftSchema>;

// ====================================================================
// MOVIMIENTOS DE EFECTIVO — entradas/salidas del cajón aparte de ventas
// ====================================================================

export const CashMovementTypeEnum = z.enum(['IN', 'OUT']);
export type CashMovementType = z.infer<typeof CashMovementTypeEnum>;

export const CashMovementSchema = z.object({
  id: z.string().uuid(),
  shiftId: z.string().uuid(),
  type: CashMovementTypeEnum,
  amount: z.number().positive(),
  reason: z.string(),
  userId: z.string().uuid(),
  userName: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type CashMovement = z.infer<typeof CashMovementSchema>;

export const CreateCashMovementSchema = z.object({
  type: CashMovementTypeEnum,
  amount: z.number().positive(),
  reason: z.string().min(3).max(200),
});
export type CreateCashMovement = z.infer<typeof CreateCashMovementSchema>;

/**
 * Estado de caja para la UI del POS. `stalePreviousDay` = el cajero dejó una
 * caja OPEN de un día anterior; debe cerrarla (Cerrar turno) antes de operar o
 * abrir una nueva.
 */
export const CurrentShiftStatusSchema = z.object({
  shift: ShiftSchema.nullable(),
  stalePreviousDay: z.boolean(),
});
export type CurrentShiftStatus = z.infer<typeof CurrentShiftStatusSchema>;

// ====================================================================
// DETALLE DE SESIÓN — GET /shifts/:id/detail
// ====================================================================

export const ShiftSessionOrderSchema = z.object({
  id: z.string().uuid(),
  receiptNumber: z.number().int(),
  turnNumber: z.number().int().nullable(),
  type: z.string(),
  status: z.string(),
  total: z.number(),
  paymentMethod: z.string().nullable(),
  customerName: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ShiftSessionOrder = z.infer<typeof ShiftSessionOrderSchema>;

export const ShiftSessionSummarySchema = z.object({
  orderCount: z.number().int(),
  paidCount: z.number().int(),
  voidCount: z.number().int(),
  totalRevenue: z.number(),
  cashRevenue: z.number(),
  transferRevenue: z.number(),
  byMethod: z.array(z.object({ method: z.string(), count: z.number().int(), total: z.number() })),
  byType: z.array(z.object({ type: z.string(), count: z.number().int(), total: z.number() })),
});
export type ShiftSessionSummary = z.infer<typeof ShiftSessionSummarySchema>;

export const ShiftSessionDetailSchema = z.object({
  shift: ShiftSchema,
  summary: ShiftSessionSummarySchema,
  orders: z.array(ShiftSessionOrderSchema),
  cashMovements: z.array(CashMovementSchema).default([]),
  cashCountBreakdown: z.array(CashCountLineSchema).nullable().default(null),
});
export type ShiftSessionDetail = z.infer<typeof ShiftSessionDetailSchema>;
