import { z } from 'zod';

export const InvoiceStatusEnum = z.enum(['PENDING_REVIEW', 'CONFIRMED', 'REJECTED']);
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

/** Estado de la factura en palabras. Fuente única (backend + admin). */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING_REVIEW: 'pendiente de revisión',
  CONFIRMED: 'confirmada',
  REJECTED: 'rechazada',
};

/** Estado de pago al proveedor (independiente de InvoiceStatus que es
 *  sobre la validación IA). NULL si la factura aún no está CONFIRMED. */
export const InvoicePaymentStatusEnum = z.enum(['PENDING', 'PAID']);
export type InvoicePaymentStatus = z.infer<typeof InvoicePaymentStatusEnum>;

/** Bolsillo de tesorería del que salió el pago al proveedor. */
export const PaymentPocketEnum = z.enum(['EFECTIVO', 'CUENTA', 'MIXTO']);
export type PaymentPocket = z.infer<typeof PaymentPocketEnum>;

// ====================================================================
// IA EXTRACTION (output del LLM, validado en backend antes de guardar)
// ====================================================================

export const ExtractedInvoiceItemSchema = z.object({
  descriptionRaw: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(40),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative(),
  // --- Desglose de empaque (cuando la descripción lo indica, ej. "150 g X 10 U") ---
  // Sub-unidades por unidad de compra (10 en "X 10 U"); sirve para sugerir el
  // conversionFactor al crear el insumo. Requeridos como `number|null` (sin
  // .catch/.default para no divergir input/output del DTO compartido); los
  // adapters LLM rellenan null si la IA omite el campo.
  packUnits: z.number().positive().nullable(),
  // Tamaño de cada sub-unidad (150 en "150 g").
  packSizePerUnit: z.number().positive().nullable(),
  // Medida de la sub-unidad ("g", "ml", "kg"…).
  packSizeMeasure: z.string().min(1).max(20).nullable(),
});
export type ExtractedInvoiceItem = z.infer<typeof ExtractedInvoiceItemSchema>;

export const ExtractedInvoiceSchema = z.object({
  supplierName: z.string().nullable(),
  supplierNit: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  total: z.number().nullable(),
  iva: z.number().nullable(),
  /** Domicilio/flete cobrado por traer la mercancía. La IA lo extrae de la
   *  línea que dice "envío", "domicilio", "flete", "transporte"… que NO es un
   *  ítem (no entra al inventario ni al costo de ningún producto). `null` si
   *  la factura no lo trae o el modelo lo omitió — los adapters lo rellenan. */
  freight: z.number().nullable(),
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
  /** Domicilio/flete de esta compra. Siempre un número (0 = sin flete): la
   *  columna es NOT NULL con default 0, así que ninguna suma necesita null-check. */
  freightAmount: z.number(),
  photoStorageKey: z.string().nullable(),
  aiModelUsed: z.string().nullable(),
  status: InvoiceStatusEnum,
  uploadedById: z.string().uuid().nullable(),
  uploadedByName: z.string().nullable().optional(),
  confirmedById: z.string().uuid().nullable(),
  confirmedByName: z.string().nullable().optional(),
  confirmedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  /** Estado de pago al proveedor. NULL = factura sin confirmar todavía. */
  paymentStatus: InvoicePaymentStatusEnum.nullable(),
  paidAt: z.string().datetime().nullable(),
  /** True si existe comprobante en storage (no se expone la key cruda al wire). */
  hasPaymentProof: z.boolean(),
  paymentActorId: z.string().uuid().nullable(),
  paymentActorName: z.string().nullable().optional(),
  paymentNote: z.string().nullable(),
  /** Bolsillo del que salió el pago. NULL mientras no esté PAID. */
  paymentPocket: PaymentPocketEnum.nullable(),
  paymentCashAmount: z.number().nullable(),
  paymentBankAmount: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  items: z.array(InvoiceItemSchema).optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

/** Body para marcar pagada vía multipart (la imagen va por `proof` field). */
export const MarkInvoicePaidSchema = z.object({
  /** Opcional: si no se envía, el backend usa NOW(). YYYY-MM-DD. */
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD')
    .optional(),
  note: z.string().max(500).optional(),
});
export type MarkInvoicePaid = z.infer<typeof MarkInvoicePaidSchema>;

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
    /** Conversión a la unidad BASE del insumo para ESTA compra: cuántas
     *  unidades base hay en 1 unidad de la línea. stockQty = quantity ×
     *  baseFactor. Si se omite, el backend usa el conversionFactor del insumo.
     *  Garantiza FIFO exacto cuando la compra viene en una unidad distinta a la
     *  por defecto (ej. "paquete 10×150 g" vs el insumo configurado en kg). */
    baseFactor: z.number().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.entityType === 'INGREDIENT' && !data.ingredientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Falta indicar a qué insumo corresponde la línea.',
        path: ['ingredientId'],
      });
    }
    if (data.entityType === 'PRODUCT' && !data.productId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Falta indicar a qué producto corresponde la línea.',
        path: ['productId'],
      });
    }
  });
export type ConfirmInvoiceItem = z.infer<typeof ConfirmInvoiceItemSchema>;

/**
 * Key de storage de un comprobante de pago PRE-subido (aún sin factura):
 * siempre `invoice-payments/pending/{uuid}.{ext}`. El regex evita pasar la
 * key de OTRO recurso (foto de factura, comprobante ya asociado) a
 * discard-payment-proof (delete) o al confirm (get).
 */
export const PendingPaymentProofKeySchema = z
  .string()
  .regex(
    /^invoice-payments\/pending\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i,
    'proofStorageKey inválida',
  );

/**
 * Pago al proveedor declarado EN la confirmación (la factura nace pagada).
 * El comprobante es OBLIGATORIO: o una imagen pre-subida vía
 * `upload-payment-proof` (carga manual), o la propia foto de la factura
 * (flujo IA — el backend la copia como comprobante). Exactamente uno.
 */
export const ConfirmInvoicePaymentSchema = z
  .object({
    proofStorageKey: PendingPaymentProofKeySchema.optional(),
    /** Usar la foto de la factura como comprobante (solo flujo con foto). */
    useInvoicePhotoAsProof: z.boolean().optional(),
    cashAmount: z.number().nonnegative(),
    bankAmount: z.number().nonnegative(),
    /** YYYY-MM-DD; default hoy. El backend rechaza fechas futuras. */
    paidAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD')
      .optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    const hasKey = data.proofStorageKey !== undefined;
    const usesPhoto = data.useInvoicePhotoAsProof === true;
    if (hasKey === usesPhoto) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Falta el comprobante: sube una imagen o marca que se use la foto de la factura (una de las dos, no ambas).',
        path: ['proofStorageKey'],
      });
    }
  });
export type ConfirmInvoicePayment = z.infer<typeof ConfirmInvoicePaymentSchema>;

export const ConfirmInvoiceSchema = z.object({
  supplierNit: z.string().min(1).max(40),
  supplierName: z.string().min(1).max(120),
  invoiceNumber: z.string().max(80).optional(),
  total: z.number().nonnegative(),
  iva: z.number().nonnegative().optional(),
  /** Domicilio/flete de la compra. Omitido = 0.
   *  La regla `freight <= total` se valida en el service, NO acá: un
   *  `superRefine` convertiría este schema en ZodEffects y rompería el
   *  `.extend()` de CreateFromPhotoSchema. */
  freight: z.number().nonnegative().optional(),
  items: z.array(ConfirmInvoiceItemSchema).min(1),
  notes: z.string().max(500).optional(),
  /** Presente = la factura nace CONFIRMED + PAGADA (comprobante obligatorio). */
  payment: ConfirmInvoicePaymentSchema.optional(),
});
export type ConfirmInvoice = z.infer<typeof ConfirmInvoiceSchema>;

/**
 * Subir foto + IA NO crea factura en DB todavía. Solo devuelve la extracción
 * y el `photoStorageKey`; el cliente lo envía de vuelta al confirmar (o usa
 * discard-photo si abandona). Evita borradores fantasma cuando el usuario
 * abre el modal y se va.
 */
/**
 * Key de storage de una foto de factura: siempre `invoices/{uuid}.{ext}`. El
 * regex evita que un admin pase la key de OTRO recurso (otra factura, un
 * comprobante de pago) a discard-photo (delete) o from-photo (get).
 */
export const PhotoStorageKeySchema = z
  .string()
  .regex(/^invoices\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i, 'photoStorageKey inválida');

export const ExtractInvoiceResponseSchema = z.object({
  photoStorageKey: z.string(),
  aiModelUsed: z.string(),
  extraction: ExtractedInvoiceSchema,
});
export type ExtractInvoiceResponse = z.infer<typeof ExtractInvoiceResponseSchema>;

/** Crear+confirmar factura desde foto (IA) en un solo paso. */
export const CreateFromPhotoSchema = ConfirmInvoiceSchema.extend({
  photoStorageKey: PhotoStorageKeySchema,
  aiModelUsed: z.string().min(1),
});
export type CreateFromPhoto = z.infer<typeof CreateFromPhotoSchema>;

/** Descartar una foto subida que nunca se confirmó (limpia storage). */
export const DiscardPhotoSchema = z.object({
  photoStorageKey: PhotoStorageKeySchema,
});
export type DiscardPhoto = z.infer<typeof DiscardPhotoSchema>;

/** Respuesta al pre-subir un comprobante de pago (antes de confirmar). */
export const UploadPaymentProofResponseSchema = z.object({
  proofStorageKey: PendingPaymentProofKeySchema,
});
export type UploadPaymentProofResponse = z.infer<typeof UploadPaymentProofResponseSchema>;

/** Descartar un comprobante pre-subido que nunca se confirmó. */
export const DiscardPaymentProofSchema = z.object({
  proofStorageKey: PendingPaymentProofKeySchema,
});
export type DiscardPaymentProof = z.infer<typeof DiscardPaymentProofSchema>;

// Response al clonar (sí persiste un draft, porque el usuario ya conoce la fuente).
export const InvoiceDraftResponseSchema = z.object({
  invoice: InvoiceSchema,
  extraction: ExtractedInvoiceSchema,
});
export type InvoiceDraftResponse = z.infer<typeof InvoiceDraftResponseSchema>;

// Request: clonar una factura confirmada para repetir su carga manualmente.
// Útil cuando la IA falla o cuando se repite una compra recurrente.
export const CloneInvoiceRequestSchema = z.object({
  sourceInvoiceId: z.string().uuid(),
});
export type CloneInvoiceRequest = z.infer<typeof CloneInvoiceRequestSchema>;
