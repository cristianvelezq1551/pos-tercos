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

export const CloseShiftSchema = z.object({
  /** Efectivo contado físicamente al cerrar. */
  countedCash: z.number().nonnegative(),
  notes: z.string().max(500).optional(),
});
export type CloseShift = z.infer<typeof CloseShiftSchema>;
