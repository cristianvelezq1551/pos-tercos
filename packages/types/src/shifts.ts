import { z } from 'zod';
import { PaymentMethodEnum } from './sales';

// ====================================================================
// SHIFT (turno de caja) — FASE 5 cubre solo apertura
// ====================================================================

export const ShiftStatusEnum = z.enum(['OPEN', 'CLOSED', 'RECONCILED']);
export type ShiftStatus = z.infer<typeof ShiftStatusEnum>;

/** Arqueo por denominación: cuántas piezas de cada valor (billete/moneda). */
export const CashCountLineSchema = z.object({
  denomination: z.number().int().positive(),
  count: z.number().int().nonnegative(),
});
export type CashCountLine = z.infer<typeof CashCountLineSchema>;

/** Arqueo DIGITAL: lo que el cajero ve en la app de cada método al cerrar. */
export const DigitalCountInputSchema = z.object({
  method: PaymentMethodEnum,
  /** Total recibido según la app (Nequi/Daviplata/banco) durante el turno. */
  counted: z.number().nonnegative(),
});
export type DigitalCountInput = z.infer<typeof DigitalCountInputSchema>;

/** Línea persistida del arqueo digital (snapshot al cierre). */
export const DigitalCountLineSchema = z.object({
  method: PaymentMethodEnum,
  /** Esperado según las ventas del turno (porción de ese método). */
  expected: z.number(),
  /** Lo contado por el cajero. Null si no arqueó ese método. */
  counted: z.number().nullable(),
  /** counted − expected. Null si no se contó. */
  difference: z.number().nullable(),
});
export type DigitalCountLine = z.infer<typeof DigitalCountLineSchema>;

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
  /** Arqueo de efectivo por denominación (solo tras el cierre). */
  cashCountBreakdown: z.array(CashCountLineSchema).nullable().optional(),
  /** Arqueo digital (expected/counted/diff por método; solo tras el cierre). */
  digitalCountBreakdown: z.array(DigitalCountLineSchema).nullable().optional(),
  /** Propinas del día (efectivo aparte; NO suma al esperado en caja). */
  tipsCollected: z.number().nonnegative().nullable().optional(),
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
// SYNC OFFLINE SHIFT OPEN — POST /shifts/sync-offline-open (B.4b)
// ====================================================================

/**
 * Apertura de caja registrada OFFLINE en el POS y sincronizada al volver la
 * red. Idempotente por `localId`. Si mientras tanto alguien abrió la caja
 * online (caja única), el backend la ADOPTA en vez de crear otra.
 */
export const SyncOfflineShiftOpenSchema = z.object({
  /** UUID generado en el POS al abrir offline — clave de idempotencia. */
  localId: z.string().uuid(),
  openingCash: z.number().nonnegative(),
  notes: z.string().max(200).optional(),
  /** Momento REAL de la apertura (backdatea openedAt en el server). */
  openedOfflineAt: z.string().datetime(),
});
export type SyncOfflineShiftOpen = z.infer<typeof SyncOfflineShiftOpenSchema>;

export const SyncOfflineShiftOpenResponseSchema = z.object({
  shift: ShiftSchema,
  /** true = ya había una caja abierta hoy y la apertura offline se mapeó a ella. */
  adopted: z.boolean(),
});
export type SyncOfflineShiftOpenResponse = z.infer<typeof SyncOfflineShiftOpenResponseSchema>;

// ====================================================================
// CLOSE SHIFT — POST /shifts/:id/close (FASE 11, schema definido ya)
// ====================================================================





export const CloseShiftSchema = z.object({
  /** Efectivo contado físicamente al cerrar (suma del arqueo si se usa). */
  countedCash: z.number().nonnegative(),
  /** Desglose por denominación (arqueo). Opcional; queda para auditoría. */
  breakdown: z.array(CashCountLineSchema).optional(),
  /** Arqueo de transferencias/digitales por método (opcional). */
  digitalCounts: z.array(DigitalCountInputSchema).optional(),
  /** Propinas del día en efectivo (bote aparte; se reparten en nómina). */
  tips: z.number().nonnegative().optional(),
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
  /** CASH = cajón físico; digital = cuenta del negocio (afecta su arqueo). */
  method: PaymentMethodEnum.default('CASH'),
  amount: z.number().positive(),
  reason: z.string(),
  userId: z.string().uuid(),
  userName: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type CashMovement = z.infer<typeof CashMovementSchema>;

export const CreateCashMovementSchema = z.object({
  type: CashMovementTypeEnum,
  method: PaymentMethodEnum.default('CASH'),
  amount: z.number().positive(),
  reason: z.string().min(3).max(200),
});
export type CreateCashMovement = z.infer<typeof CreateCashMovementSchema>;

/** Corrección de un movimiento mal registrado (solo con la caja abierta). */
export const UpdateCashMovementSchema = CreateCashMovementSchema;
export type UpdateCashMovement = z.infer<typeof UpdateCashMovementSchema>;

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

/** Efectivo esperado autoritativo de una caja OPEN (target del cierre). */
export const ExpectedCashSchema = z.object({
  expectedCash: z.number(),
  openingCash: z.number(),
  cashSalesTotal: z.number(),
  cashIn: z.number(),
  cashOut: z.number(),
});
export type ExpectedCash = z.infer<typeof ExpectedCashSchema>;

// ====================================================================
// DETALLE DE SESIÓN — GET /shifts/:id/detail
// ====================================================================

export const ShiftSessionOrderSchema = z.object({
  id: z.string().uuid(),
  receiptNumber: z.number().int(),
  type: z.string(),
  status: z.string(),
  total: z.number(),
  paymentMethod: z.string().nullable(),
  customerName: z.string().nullable(),
  createdAt: z.string().datetime(),
  /** Pagos de la venta (1 si fue único; N si la cuenta se dividió). */
  payments: z.array(z.object({ method: z.string(), amount: z.number() })).default([]),
  /** Productos vendidos (resumen liviano para el arqueo). */
  items: z
    .array(
      z.object({
        quantity: z.number().int(),
        name: z.string(),
        /** Precio unitario al momento de la venta (sin descuentos). */
        unitPrice: z.number().default(0),
        /** Descuento aplicado a la línea (promo o descuento manual). */
        lineDiscount: z.number().default(0),
        /** true si el descuento vino de una promoción activa (no manual). */
        hasPromotion: z.boolean().default(false),
        lineTotal: z.number(),
        /** Costo estimado de la línea. null si es desconocido o el rol no ve costos. */
        lineCost: z.number().nullable().default(null),
        /** Ganancia de la línea (lineTotal − lineCost). null si costo desconocido. */
        lineMargin: z.number().nullable().default(null),
        /** Margen de la línea como fracción (0..1). null si no aplica. */
        lineMarginPct: z.number().nullable().default(null),
      }),
    )
    .default([]),
  /** Descuento total de la venta (Σ líneas + descuento sobre el total). */
  discountTotal: z.number().default(0),
  /** Porción del descuento aplicada sobre el total (no por línea). */
  orderDiscountAmount: z.number().default(0),
  /** Motivo del descuento manual, si lo hubo. */
  discountReason: z.string().nullable().default(null),
  /** Costo total del pedido. null si algún costo es desconocido o el rol no ve costos. */
  costTotal: z.number().nullable().default(null),
  /** Ganancia del pedido (total − costTotal). null si no aplica. */
  marginTotal: z.number().nullable().default(null),
  /** Margen del pedido como fracción (0..1). null si no aplica. */
  marginPct: z.number().nullable().default(null),
});
export type ShiftSessionOrder = z.infer<typeof ShiftSessionOrderSchema>;

export const ShiftSessionSummarySchema = z.object({
  orderCount: z.number().int(),
  paidCount: z.number().int(),
  voidCount: z.number().int(),
  /** Pedidos cancelados (CANCELADO_NO_PAGO + CANCELADO_SIN_REEMBOLSO). */
  canceledCount: z.number().int().default(0),
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
  /** Arqueo digital al cierre (expected/counted/diff por método). */
  digitalCountBreakdown: z.array(DigitalCountLineSchema).nullable().default(null),
});
export type ShiftSessionDetail = z.infer<typeof ShiftSessionDetailSchema>;
