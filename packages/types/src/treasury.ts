import { z } from 'zod';

// ====================================================================
// Tesorería — control de caja de dos bolsillos (Efectivo y Cuenta).
// Réplica del Excel "Control de Caja": cuánto hay y cómo está, con
// traspasos entre bolsillos y ajustes manuales (modelo híbrido).
// ====================================================================

export const PocketEnum = z.enum(['EFECTIVO', 'CUENTA']);
export type Pocket = z.infer<typeof PocketEnum>;

export const POCKET_LABELS: Record<Pocket, string> = {
  EFECTIVO: 'Efectivo',
  CUENTA: 'Cuenta',
};

const DateOnlyNullable = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)')
  .nullable();

// --- Config (saldos iniciales = "celdas amarillas") ---

export const TreasuryConfigSchema = z.object({
  /** Desde cuándo se cuenta. NULL = todo el histórico. */
  anchorDate: DateOnlyNullable,
  initialCash: z.number(),
  initialBank: z.number(),
});
export type TreasuryConfig = z.infer<typeof TreasuryConfigSchema>;

export const UpdateTreasuryConfigSchema = z.object({
  anchorDate: DateOnlyNullable,
  initialCash: z.number().min(0),
  initialBank: z.number().min(0),
});
export type UpdateTreasuryConfig = z.infer<typeof UpdateTreasuryConfigSchema>;

/**
 * Solo la fecha de corte, SIN saldos: la consumen flujos AdminAccess (aviso
 * "fecha anterior al corte" al registrar pagos) sin exponer datos financieros.
 */
export const TreasuryAnchorDateSchema = z.object({
  anchorDate: DateOnlyNullable,
});
export type TreasuryAnchorDate = z.infer<typeof TreasuryAnchorDateSchema>;

// --- Movimientos manuales (traspasos + ajustes) ---

export const TreasuryMovementSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['TRANSFER', 'ADJUSTMENT']),
  fromPocket: PocketEnum.nullable(),
  toPocket: PocketEnum.nullable(),
  pocket: PocketEnum.nullable(),
  amount: z.number(),
  reason: z.string(),
  status: z.enum(['ACTIVE', 'VOIDED']),
  occurredAt: z.string().datetime(),
  actorName: z.string().nullable(),
});
export type TreasuryMovement = z.infer<typeof TreasuryMovementSchema>;

export const CreateTransferSchema = z
  .object({
    fromPocket: PocketEnum,
    toPocket: PocketEnum,
    amount: z.number().positive(),
    reason: z.string().min(3).max(200),
    occurredAt: z.string().datetime().optional(),
  })
  .refine((v) => v.fromPocket !== v.toPocket, {
    message: 'El origen y el destino deben ser distintos',
    path: ['toPocket'],
  });
export type CreateTransfer = z.infer<typeof CreateTransferSchema>;

export const CreateAdjustmentSchema = z.object({
  pocket: PocketEnum,
  /** Con signo: + suma al bolsillo, − resta. */
  amount: z.number().refine((v) => v !== 0, 'El monto no puede ser 0'),
  reason: z.string().min(3).max(200),
  occurredAt: z.string().datetime().optional(),
});
export type CreateAdjustment = z.infer<typeof CreateAdjustmentSchema>;

// --- Panel (resumen calculado) ---

/** Desglose de cómo se forma el saldo de un bolsillo (filas del Excel). */
export const PocketBreakdownSchema = z.object({
  pocket: PocketEnum,
  initial: z.number(),
  income: z.number(),
  expensesPaid: z.number(),
  transfersIn: z.number(),
  transfersOut: z.number(),
  adjustments: z.number(),
  balance: z.number(),
});
export type PocketBreakdown = z.infer<typeof PocketBreakdownSchema>;

export const CommitmentByResponsibleSchema = z.object({
  responsible: z.string(),
  total: z.number(),
});
export type CommitmentByResponsible = z.infer<typeof CommitmentByResponsibleSchema>;

export const TreasurySummarySchema = z.object({
  asOf: z.string().datetime(),
  anchorDate: DateOnlyNullable,
  cash: PocketBreakdownSchema,
  bank: PocketBreakdownSchema,
  /** Efectivo + Cuenta. */
  total: z.number(),
  /** Compromisos pendientes (lo que falta pagar). */
  commitmentsTotal: z.number(),
  commitmentsByResponsible: z.array(CommitmentByResponsibleSchema),
  /** total − compromisos. */
  projected: z.number(),
});
export type TreasurySummary = z.infer<typeof TreasurySummarySchema>;
