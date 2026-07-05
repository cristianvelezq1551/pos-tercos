import { z } from 'zod';

/**
 * Cortesía: producto regalado (línea de un pedido o suelto). Desde 2026-07 se
 * registran AUTO-APROBADAS (sin gate de admin): al crearse descuentan stock a
 * costo FIFO y notifican al dueño. `REVERSED` = el admin la anuló por error
 * (devuelve stock, sale del COGS de cortesías). `PENDING`/`REJECTED` quedan solo
 * por compatibilidad con filas históricas del flujo anterior de aprobación.
 */
export const CortesiaStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVERSED']);
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
  /** Costo estimado al solicitar (referencia; preview de pendientes). */
  costAmount: z.number().nullable(),
  /** Costo FIFO REAL (solo autorizadas; null si pendiente/rechazada o s/d). */
  fifoCost: z.number().nullable().optional(),
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

/** Total dado en cortesías (autorizadas) del mes — costo FIFO, igual al P&G. */
export const CortesiaGivenSummarySchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  monthLabel: z.string(),
  /** Costo FIFO de las cortesías autorizadas cuya aprobación cae en la ventana. */
  total: z.number(),
  count: z.number().int().nonnegative(),
  /** true si alguna cortesía no tenía lote FIFO al aprobar → el total puede estar
   *  subestimado. */
  partial: z.boolean(),
});
export type CortesiaGivenSummary = z.infer<typeof CortesiaGivenSummarySchema>;
