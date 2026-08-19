import { z } from 'zod';
import type { ReceiptData } from '@pos-tercos/domain';

/**
 * Contratos de entrada del agent. Extraídos de `main.ts` para poder testearlos.
 *
 * Recibo en datos (sin `business`): el POS lo manda así cuando imprime SIN
 * backend (offline). El agent rinde los bytes ESC/POS con `renderReceiptEscPos`
 * y rellena el negocio desde su propio `.env` (BUSINESS_*). Espeja `ReceiptData`
 * de @pos-tercos/domain salvo `business`.
 */

const ModifierSchema = z.object({
  name: z.string(),
  priceDelta: z.number(),
});

const ReceiptItemSchema = z.object({
  productName: z.string(),
  sizeName: z.string().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  lineSubtotal: z.number(),
  lineDiscount: z.number(),
  lineTotal: z.number(),
  appliedPromotionName: z.string().nullable(),
  modifiers: z.array(ModifierSchema),
});

export const ReceiptInputSchema = z.object({
  receiptNumber: z.number(),
  provisionalNumber: z.string().nullable().optional(),
  createdAt: z.string(),
  cashierName: z.string().nullable(),
  customerName: z.string().nullable(),
  items: z.array(ReceiptItemSchema),
  subtotal: z.number(),
  discountTotal: z.number(),
  total: z.number(),
  reprintLabel: z.string().nullable(),
  openDrawer: z.boolean().optional(),
});

/**
 * El /print acepta DOS formas: bytes ya renderizados (online, vienen del
 * backend) o el recibo en datos (offline, lo rinde el agent). Al menos una.
 */
export const PrintBodySchema = z
  .object({
    escposBase64: z.string().min(1).optional(),
    receipt: ReceiptInputSchema.optional(),
    // Impresora destino (nombre Windows). El POS rutea cada documento a la
    // impresora asignada; si falta, el agent usa la del .env.
    printer: z.string().min(1).nullable().optional(),
  })
  .refine((b) => Boolean(b.escposBase64) || Boolean(b.receipt), {
    message: 'Falta escposBase64 o receipt',
  });

export const DrawerBodySchema = z
  .object({ printer: z.string().min(1).nullable().optional() })
  .optional();

/** Datos del negocio para el recibo offline — del .env del agent (misma PC). */
export function businessFromEnv(env: NodeJS.ProcessEnv): ReceiptData['business'] {
  return {
    name: env.BUSINESS_NAME ?? 'POS Tercos',
    address: env.BUSINESS_ADDRESS ?? 'Dirección por configurar',
    nit: env.BUSINESS_NIT ?? '900.000.000-0',
    phone: env.BUSINESS_PHONE ?? null,
  };
}
