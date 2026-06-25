import { z } from 'zod';

/** Cortesía: producto regalado (línea de un pedido o suelto). */
export const CortesiaStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type CortesiaStatus = z.infer<typeof CortesiaStatusEnum>;

export const CreateCortesiaSchema = z.object({
  productId: z.string().uuid(),
  sizeId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().positive(),
  reason: z.string().trim().min(3).max(200),
  /** Pedido que acompañó la cortesía (contexto), si aplica. */
  saleId: z.string().uuid().nullable().optional(),
});
export type CreateCortesia = z.infer<typeof CreateCortesiaSchema>;

export const ResolveCortesiaSchema = z.object({
  note: z.string().trim().max(200).optional(),
});
export type ResolveCortesia = z.infer<typeof ResolveCortesiaSchema>;

export const CortesiaRequestSchema = z.object({
  id: z.string(),
  status: CortesiaStatusEnum,
  saleId: z.string().nullable(),
  productId: z.string(),
  productName: z.string().nullable(),
  sizeId: z.string().nullable(),
  sizeName: z.string().nullable(),
  quantity: z.number(),
  reason: z.string(),
  costAmount: z.number().nullable(),
  salePrice: z.number(),
  requestedById: z.string(),
  requestedByName: z.string().nullable(),
  resolvedById: z.string().nullable(),
  resolvedByName: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolverNote: z.string().nullable(),
  seenByRequester: z.boolean(),
  createdAt: z.string(),
});
export type CortesiaRequest = z.infer<typeof CortesiaRequestSchema>;
