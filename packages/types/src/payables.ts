import { z } from 'zod';

// ====================================================================
// Compromisos / cuentas por pagar a personas (ad-hoc). "Responsable" del
// Excel = a quién se le debe. Al pagar se reparte por bolsillo (efectivo /
// cuenta / mixto) y alimenta la Tesorería.
// ====================================================================

export const PayableStatusEnum = z.enum(['PENDING', 'PAID', 'CANCELLED']);
export type PayableStatus = z.infer<typeof PayableStatusEnum>;

export const PayableCommitmentSchema = z.object({
  id: z.string().uuid(),
  beneficiary: z.string(),
  description: z.string(),
  amount: z.number(),
  status: PayableStatusEnum,
  cashAmount: z.number(),
  bankAmount: z.number(),
  hasProof: z.boolean(),
  paidAt: z.string().datetime().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PayableCommitment = z.infer<typeof PayableCommitmentSchema>;

export const CreatePayableSchema = z.object({
  beneficiary: z.string().min(1, 'Indica a quién se le debe').max(120),
  description: z.string().min(1, 'Describe el compromiso').max(300),
  amount: z.number().positive('El monto debe ser mayor a 0'),
});
export type CreatePayable = z.infer<typeof CreatePayableSchema>;

/** Pago de un compromiso: efectivo + cuenta deben sumar el monto. */
export const PayPayableSchema = z.object({
  cashAmount: z.number().nonnegative(),
  bankAmount: z.number().nonnegative(),
  note: z.string().max(300).optional(),
});
export type PayPayable = z.infer<typeof PayPayableSchema>;
