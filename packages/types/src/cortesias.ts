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
  /** true si parte de `fifoCost` se valuó al último precio conocido porque el
   *  insumo no estaba cargado. Es un costo honesto pero PROVISIONAL: se corrige
   *  solo al subir la factura de compra. La UI lo marca como estimado. */
  fifoCostEstimated: z.boolean().optional(),
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
  /** true si alguna cortesía no tenía lote FIFO al aprobar NI precio con qué
   *  estimarla → el total puede estar subestimado. */
  partial: z.boolean(),
  /** Parte del total valuada con el último precio conocido (el insumo no estaba
   *  cargado). >0 ⇒ el número es provisional hasta que entre la factura. */
  estimatedCost: z.number(),
});
export type CortesiaGivenSummary = z.infer<typeof CortesiaGivenSummarySchema>;

/**
 * Los dos papeles de un pedido regalado, en bytes ESC/POS (base64) para que el
 * NAVEGADOR del mostrador los mande al print-agent local — igual que el recibo
 * de una venta.
 */
export const CortesiaPrintDocsSchema = z.object({
  receiptBase64: z.string(),
  /** null cuando el pedido era solo reventa (nada que preparar en cocina). */
  comandaBase64: z.string().nullable(),
  kitchenItemCount: z.number().int().nonnegative(),
  valorRegalado: z.number().nonnegative(),
});
export type CortesiaPrintDocs = z.infer<typeof CortesiaPrintDocsSchema>;

/** Las líneas que forman UN pedido regalado (las que la caja acaba de crear). */
export const PrintCortesiaSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});
export type PrintCortesia = z.infer<typeof PrintCortesiaSchema>;
