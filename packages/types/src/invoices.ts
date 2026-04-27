import { z } from 'zod';

export const InvoiceStatusEnum = z.enum(['PENDING_REVIEW', 'CONFIRMED', 'REJECTED']);
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

// ====================================================================
// IA EXTRACTION (output del LLM, validado en backend antes de guardar)
// ====================================================================

export const ExtractedInvoiceItemSchema = z.object({
  descriptionRaw: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(40),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative(),
});
export type ExtractedInvoiceItem = z.infer<typeof ExtractedInvoiceItemSchema>;

export const ExtractedInvoiceSchema = z.object({
  supplierName: z.string().nullable(),
  supplierNit: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  total: z.number().nullable(),
  iva: z.number().nullable(),
  // items y warnings se exigen siempre como array (vacío si no aplica).
  // No usamos .default() aquí porque Zod hace que el input type difiera
  // del output type, lo que rompe la inferencia de DTOs compartidos.
  items: z.array(ExtractedInvoiceItemSchema),
  warnings: z.array(z.string()),
});
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;

// ====================================================================
// INVOICE ENTITIES (DTOs en wire)
// ====================================================================

export const InvoiceItemSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  // Polimórfico: el item asocia a un Insumo o Producto direct-resale.
  // Ambos null si todavía no se asoció.
  entityType: z.enum(['INGREDIENT', 'PRODUCT']).nullable(),
  ingredientId: z.string().uuid().nullable(),
  productId: z.string().uuid().nullable(),
  /** Nombre resuelto del item asociado (server-embedded). */
  itemName: z.string().nullable().optional(),
  descriptionRaw: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unitPrice: z.number(),
  total: z.number(),
  sortOrder: z.number().int(),
});
export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;

export const InvoiceSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable(),
  total: z.number().nullable(),
  iva: z.number().nullable(),
  photoStorageKey: z.string().nullable(),
  aiModelUsed: z.string().nullable(),
  status: InvoiceStatusEnum,
  uploadedById: z.string().uuid().nullable(),
  uploadedByName: z.string().nullable().optional(),
  confirmedById: z.string().uuid().nullable(),
  confirmedByName: z.string().nullable().optional(),
  confirmedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  items: z.array(InvoiceItemSchema).optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

// ====================================================================
// CONFIRM PAYLOAD (lo que envía la UI al confirmar tras editar)
// ====================================================================

/**
 * Cada item de la factura confirma con su tipo (INGREDIENT o PRODUCT)
 * y el ID correspondiente. La validación en backend exige consistencia
 * entre entityType y los FK.
 */
export const ConfirmInvoiceItemSchema = z
  .object({
    entityType: z.enum(['INGREDIENT', 'PRODUCT']),
    ingredientId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    descriptionRaw: z.string().min(1).max(500),
    quantity: z.number().positive(),
    unit: z.string().min(1).max(40),
    unitPrice: z.number().nonnegative(),
    total: z.number().nonnegative(),
  })
  .superRefine((data, ctx) => {
    if (data.entityType === 'INGREDIENT' && !data.ingredientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ingredientId required when entityType=INGREDIENT',
        path: ['ingredientId'],
      });
    }
    if (data.entityType === 'PRODUCT' && !data.productId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'productId required when entityType=PRODUCT',
        path: ['productId'],
      });
    }
  });
export type ConfirmInvoiceItem = z.infer<typeof ConfirmInvoiceItemSchema>;

export const ConfirmInvoiceSchema = z.object({
  supplierNit: z.string().min(1).max(40),
  supplierName: z.string().min(1).max(120),
  invoiceNumber: z.string().max(80).optional(),
  total: z.number().nonnegative(),
  iva: z.number().nonnegative().optional(),
  items: z.array(ConfirmInvoiceItemSchema).min(1),
  notes: z.string().max(500).optional(),
});
export type ConfirmInvoice = z.infer<typeof ConfirmInvoiceSchema>;

// Response al subir foto (draft con extracción IA)
export const InvoiceDraftResponseSchema = z.object({
  invoice: InvoiceSchema,
  extraction: ExtractedInvoiceSchema,
});
export type InvoiceDraftResponse = z.infer<typeof InvoiceDraftResponseSchema>;
