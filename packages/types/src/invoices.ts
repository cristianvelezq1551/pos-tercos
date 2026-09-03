import { z } from 'zod';
import { MAX_PROOFS_POR_PAGO } from './finance';

export const InvoiceStatusEnum = z.enum(['PENDING_REVIEW', 'CONFIRMED', 'REJECTED', 'VOIDED']);
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

/** Estado de la factura en palabras. Fuente única (backend + admin). */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING_REVIEW: 'pendiente de revisión',
  CONFIRMED: 'confirmada',
  REJECTED: 'rechazada',
  VOIDED: 'anulada',
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
  /**
   * Conversión a la unidad BASE elegida POR LA PERSONA para esta línea.
   *
   * La IA nunca lo devuelve (por eso el normalizador lo rellena en null): nace
   * al guardar un borrador, porque el modal inicializa sus campos desde la
   * extracción y sin esto una conversión corregida a mano se perdía al
   * reanudar. Perderla es silencioso y caro: al confirmar entraría otra
   * cantidad de mercancía y el costo del insumo saldría disparado
   * (ver `conversionSospechosa` en el admin).
   */
  baseFactor: z.number().positive().nullable(),
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
  /** Cuántos comprobantes tiene el pago (un pago puede llevar varios).
   *  Opcional a propósito: la API (Railway) y el admin (Vercel) se despliegan
   *  por separado, así que durante unos minutos el navegador nuevo puede pegarle
   *  a la API vieja. Sin comprobante, cae a `hasPaymentProof ? 1 : 0`. */
  paymentProofsCount: z.number().int().nonnegative().optional(),
  paymentActorId: z.string().uuid().nullable(),
  paymentActorName: z.string().nullable().optional(),
  paymentNote: z.string().nullable(),
  /** Bolsillo del que salió el pago. NULL mientras no esté PAID. */
  paymentPocket: PaymentPocketEnum.nullable(),
  paymentCashAmount: z.number().nullable(),
  paymentBankAmount: z.number().nullable(),
  /** Anulación: cuándo, quién y por qué. NULL mientras la factura viva. */
  voidedAt: z.string().datetime().nullable(),
  voidedByName: z.string().nullable().optional(),
  voidReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  items: z.array(InvoiceItemSchema).optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

/**
 * Editar el domicilio de una factura YA CONFIRMADA.
 *
 * Existe porque el flete no siempre viene en la factura: a veces se le paga en
 * efectivo al que trae, y eso se recuerda después (decisión del dueño
 * 2026-08-28). Es de lo poco de una factura confirmada que se puede corregir
 * sin riesgo — el flete NO genera movimientos de inventario, así que no toca el
 * FIFO ni el costo de ningún producto.
 */
export const UpdateInvoiceFreightSchema = z.object({
  /** Nuevo domicilio. 0 = quitarlo. */
  freight: z.number().nonnegative(),
  /** Nuevo total de la factura. Tiene que seguir explicándose con los ítems más
   *  el domicilio; el cliente lo manda explícito para no adivinar si el flete
   *  se SUMA al total (se pagó aparte) o ya estaba adentro. */
  total: z.number().nonnegative(),
  /** De qué bolsillo salió (o a cuál volvió) la diferencia. OBLIGATORIO si la
   *  factura ya está pagada: sin esto el reparto por bolsillo dejaría de sumar
   *  el total y Tesorería quedaría descuadrada en silencio. */
  pocket: z.enum(['EFECTIVO', 'CUENTA']).optional(),
  /** Por qué se corrige. Va a la bitácora. */
  note: z.string().max(300).optional(),
});
export type UpdateInvoiceFreight = z.infer<typeof UpdateInvoiceFreightSchema>;

/**
 * Anular una factura CONFIRMADA: deshace la entrada de mercancía y la saca de
 * todos los reportes, dejando los libros como si nunca se hubiera cargado.
 *
 * Ventana corta y a propósito: pasados unos días, la mercancía ya se consumió,
 * el mes puede estar cerrado y corregir a ciegas hace más daño que el error.
 * Después de eso el camino sigue siendo el ajuste manual de inventario.
 */
export const VoidInvoiceSchema = z.object({
  /** Por qué se anula. Va a la bitácora y a la ficha de la factura. */
  reason: z.string().min(5, 'Escribe por qué se anula (mínimo 5 caracteres).').max(300),
});
export type VoidInvoice = z.infer<typeof VoidInvoiceSchema>;

/** Qué le va a pasar al inventario si se anula. Se consulta ANTES de anular. */
export const VoidInvoicePreviewLineSchema = z.object({
  entityType: z.enum(['INGREDIENT', 'PRODUCT']),
  entityId: z.string().uuid(),
  name: z.string(),
  /** Unidad en la que se lleva el inventario de ese ítem. */
  unit: z.string(),
  /** Existencias de ahora. */
  currentStock: z.number(),
  /** Lo que se va a devolver (negativo: sale del inventario). */
  delta: z.number(),
  /** En cuánto queda. Puede ser negativo si ya se consumió. */
  resultingStock: z.number(),
});
export type VoidInvoicePreviewLine = z.infer<typeof VoidInvoicePreviewLineSchema>;

export const VoidInvoicePreviewSchema = z.object({
  /** Si no se puede anular, el motivo en palabras (y `lines` va vacío). */
  blockedReason: z.string().nullable(),
  /** Días que quedan de la ventana de anulación. */
  daysLeft: z.number(),
  lines: z.array(VoidInvoicePreviewLineSchema),
  /** Ítems que quedarían en negativo: la caja va a frenar su venta. */
  goesNegative: z.array(z.string()),
});
export type VoidInvoicePreview = z.infer<typeof VoidInvoicePreviewSchema>;

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
 * El comprobante es OBLIGATORIO y puede ser MÁS DE UNO: imágenes pre-subidas
 * vía `upload-payment-proof` (carga manual) y/o la propia foto de la factura
 * (flujo IA — el backend la copia como comprobante). Al menos una fuente.
 *
 * Las dos se pueden combinar: la foto de la factura como respaldo y la captura
 * de la transferencia como comprobante del pago es un par corriente. Antes era
 * excluyente solo porque cabía una sola imagen.
 */
export const ConfirmInvoicePaymentSchema = z
  .object({
    /** Legacy: una sola imagen. Se sigue aceptando porque la API y el admin se
     *  despliegan por separado. Equivale a `proofStorageKeys: [key]`. */
    proofStorageKey: PendingPaymentProofKeySchema.optional(),
    proofStorageKeys: z
      .array(PendingPaymentProofKeySchema)
      .min(1)
      .max(MAX_PROOFS_POR_PAGO)
      .optional(),
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
    const subidas = confirmProofKeys(data);
    const usaFoto = data.useInvoicePhotoAsProof === true;
    if (subidas.length === 0 && !usaFoto) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Falta el comprobante: sube al menos una imagen o marca que se use la foto de la factura.',
        path: ['proofStorageKeys'],
      });
    }
    if (subidas.length + (usaFoto ? 1 : 0) > MAX_PROOFS_POR_PAGO) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Un pago admite hasta ${MAX_PROOFS_POR_PAGO} comprobantes.`,
        path: ['proofStorageKeys'],
      });
    }
  });
export type ConfirmInvoicePayment = z.infer<typeof ConfirmInvoicePaymentSchema>;

/**
 * Las imágenes pre-subidas del pago, en una sola lista. Normaliza el campo
 * legacy de una sola clave para que nadie tenga que mirar los dos.
 */
export function confirmProofKeys(payment: {
  proofStorageKey?: string;
  proofStorageKeys?: string[];
}): string[] {
  if (payment.proofStorageKeys && payment.proofStorageKeys.length > 0) {
    return payment.proofStorageKeys;
  }
  return payment.proofStorageKey ? [payment.proofStorageKey] : [];
}

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

/**
 * Guardar la factura como BORRADOR, sin tocar nada.
 *
 * Un borrador no mueve inventario, ni costos, ni tesorería, ni aparece en
 * ningún reporte (todos filtran por CONFIRMED). Existe para poder releer la
 * factura con calma —o contra el papel— antes de que entre a los libros.
 *
 * Pide LO MISMO que confirmar (proveedor, ítems asociados, totales coherentes)
 * a propósito: un borrador siempre tiene que poder confirmarse tal como está.
 * Un estado a medio llenar sería una segunda forma de validar, y las dos se
 * separan con el tiempo.
 *
 * El PAGO no viaja: se declara al confirmar. Guardar un comprobante contra una
 * factura que todavía no existe en los libros dejaría plata registrada por algo
 * que puede terminar borrado.
 */
export const SaveInvoiceDraftSchema = ConfirmInvoiceSchema.omit({ payment: true }).extend({
  /** Flujo IA: foto ya subida. Los dos campos van juntos o ninguno. */
  photoStorageKey: PhotoStorageKeySchema.optional(),
  aiModelUsed: z.string().min(1).max(120).optional(),
  /** Avisos de la IA, para no perderlos al reanudar el borrador. */
  warnings: z.array(z.string().max(500)).max(50).optional(),
});
export type SaveInvoiceDraft = z.infer<typeof SaveInvoiceDraftSchema>;

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
