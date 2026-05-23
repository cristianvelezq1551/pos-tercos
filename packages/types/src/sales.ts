import { z } from 'zod';

// ====================================================================
// ENUMS (espejo de Prisma SaleType / SaleStatus / PaymentMethod)
// ====================================================================

export const SaleTypeEnum = z.enum(['COUNTER', 'WEB_PICKUP']);
export type SaleType = z.infer<typeof SaleTypeEnum>;

export const SaleStatusEnum = z.enum([
  'PENDIENTE_PAGO',
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
  'CANCELADO_NO_PAGO',
  'CANCELADO_SIN_REEMBOLSO',
  'VOID',
]);
export type SaleStatus = z.infer<typeof SaleStatusEnum>;

export const PaymentMethodEnum = z.enum([
  'CASH',
  'NEQUI',
  'DAVIPLATA',
  'QR_BANCOLOMBIA',
  'TRANSFER',
]);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

/**
 * Métodos digitales que requieren doble validación en POS antes de
 * confirmar (architecture.md §5.3): el cajero debe verificar en la app
 * del negocio + comprobante del cliente. Incluye todos excepto CASH.
 */
export const DIGITAL_PAYMENT_METHODS = [
  'NEQUI',
  'DAVIPLATA',
  'QR_BANCOLOMBIA',
  'TRANSFER',
] as const satisfies readonly PaymentMethod[];

// ====================================================================
// SALE ITEM — wire format (output del backend)
// ====================================================================

/**
 * Snapshot de un modificador aplicado al ítem. Se guarda en
 * `sale_items.modifiers_json` como array. priceDelta queda CONGELADO
 * al momento de la venta (si después cambia el precio del modifier
 * en catálogo, este snapshot no se mueve).
 */
export const AppliedModifierSchema = z.object({
  modifierId: z.string().uuid(),
  name: z.string(),
  priceDelta: z.number(),
});
export type AppliedModifier = z.infer<typeof AppliedModifierSchema>;

export const SaleItemSchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string().optional(),
  sizeId: z.string().uuid().nullable(),
  sizeName: z.string().nullable().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  modifiers: z.array(AppliedModifierSchema).default([]),
  /** Notas de cocina por línea (ej. "sin cebolla"). */
  notes: z.string().nullable().optional(),
  appliedPromotionId: z.string().uuid().nullable(),
  appliedPromotionName: z.string().nullable().optional(),
  lineSubtotal: z.number().nonnegative(),
  lineDiscount: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
});
export type SaleItem = z.infer<typeof SaleItemSchema>;

// ====================================================================
// SALE — wire format (output del backend)
// ====================================================================

export const SaleSchema = z.object({
  id: z.string().uuid(),
  receiptNumber: z.number().int().positive(),
  type: SaleTypeEnum,
  status: SaleStatusEnum,
  // null hasta el pago: el turno se asigna en confirmPayment (secuencia diaria
  // única compartida COUNTER + WEB_PICKUP).
  turnNumber: z.number().int().nullable(),

  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  customerNit: z.string().nullable(),

  subtotal: z.number().nonnegative(),
  discountTotal: z.number().nonnegative(),
  total: z.number().nonnegative(),

  paymentMethod: PaymentMethodEnum.nullable(),
  paidAt: z.string().datetime().nullable(),
  paidByUserId: z.string().uuid().nullable(),
  paidByName: z.string().nullable().optional(),

  cashierId: z.string().uuid().nullable(),
  cashierName: z.string().nullable().optional(),

  shiftId: z.string().uuid().nullable(),

  notes: z.string().nullable(),
  /** Motivo de anulación (solo cuando status=VOID). */
  voidReason: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable(),
  createdAt: z.string().datetime(),

  items: z.array(SaleItemSchema).optional(),
});
export type Sale = z.infer<typeof SaleSchema>;

// ====================================================================
// CREATE SALE — payload del POS al crear venta
// ====================================================================

/**
 * Modificador propuesto por el POS al crear venta. priceDelta es
 * informativo en el request (el backend re-resuelve contra catálogo
 * actual y CONGELA el resultado en el snapshot).
 */
export const CreateSaleItemModifierSchema = z.object({
  modifierId: z.string().uuid(),
});
export type CreateSaleItemModifier = z.infer<typeof CreateSaleItemModifierSchema>;

export const CreateSaleItemSchema = z.object({
  productId: z.string().uuid(),
  sizeId: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  modifiers: z.array(CreateSaleItemModifierSchema).optional(),
  /** Notas de cocina por línea (ej. "sin cebolla"). */
  notes: z.string().max(200).optional(),
});
export type CreateSaleItem = z.infer<typeof CreateSaleItemSchema>;

/**
 * Payload de POST /sales. Para FASE 5 solo se acepta type=COUNTER.
 * Customer fields son obligatorios cuando type=WEB_*.
 *
 * Idempotency-Key se envía como HTTP header, no en body. El backend
 * lo persiste en sales.idempotency_key + idempotency_keys table.
 *
 * El backend recalcula subtotal/discount/total contra el catálogo y
 * el motor de promociones. NO confía en lo que envía el POS.
 */
export const CreateSaleSchema = z
  .object({
    type: SaleTypeEnum.default('COUNTER'),
    items: z.array(CreateSaleItemSchema).min(1),

    customerName: z.string().min(1).max(120).optional(),
    customerPhone: z.string().min(1).max(40).optional(),
    customerNit: z.string().min(1).max(40).optional(),

    notes: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== 'COUNTER') {
      const ctxMsg = `${data.type} requires customerName + customerPhone`;
      if (!data.customerName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: ctxMsg,
          path: ['customerName'],
        });
      }
      if (!data.customerPhone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: ctxMsg,
          path: ['customerPhone'],
        });
      }
    }
  });
export type CreateSale = z.infer<typeof CreateSaleSchema>;

// ====================================================================
// CONFIRM PAYMENT — POST /sales/:id/confirm-payment
// ====================================================================

export const ConfirmPaymentSchema = z
  .object({
    method: PaymentMethodEnum,
    /** Monto recibido (CASH puede ser > total → vuelto). Para digital === total. */
    amountReceived: z.number().positive(),
    /** Para métodos digitales: confirmación explícita de doble validación
     *  (verificar app del negocio + comprobante cliente). UI obliga true. */
    digitalDoubleVerified: z.boolean().optional(),
    notes: z.string().max(200).optional(),
    /** true = actualización retroactiva (offline) → NO avisar al cliente por WhatsApp. */
    silent: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const isDigital = (DIGITAL_PAYMENT_METHODS as readonly PaymentMethod[]).includes(
      data.method,
    );
    if (isDigital && !data.digitalDoubleVerified) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${data.method} requires digitalDoubleVerified=true (app del negocio + comprobante cliente)`,
        path: ['digitalDoubleVerified'],
      });
    }
  });
export type ConfirmPayment = z.infer<typeof ConfirmPaymentSchema>;

// ====================================================================
// VOID SALE — POST /sales/:id/void (X-Approval-Pin obligatorio)
// ====================================================================

export const VoidSaleSchema = z.object({
  /** Motivo obligatorio (audit). 5-200 chars. */
  reason: z.string().min(5).max(200),
});
export type VoidSale = z.infer<typeof VoidSaleSchema>;

// ====================================================================
// WHATSAPP CLICK TRACKING — POST /sales/:id/whatsapp-clicked (FASE 9)
// ====================================================================
// El backend NO envía el WhatsApp (es wa.me, lo dispara el browser del
// cajero/cocinero). Este endpoint solo registra el click para auditoría:
// "% de pedidos web que recibieron WhatsApp en cada stage".
//
// El stage debe ser coherente con el status actual del sale, pero no
// lo cambia: la transición real la hace `confirm-payment` o el KDS.

export const WhatsAppStageEnum = z.enum(['accepted', 'confirmed', 'ready']);
export type WhatsAppStage = z.infer<typeof WhatsAppStageEnum>;

export const WhatsAppClickedSchema = z.object({
  stage: WhatsAppStageEnum,
});
export type WhatsAppClicked = z.infer<typeof WhatsAppClickedSchema>;

// ====================================================================
// OPEN DRAWER — POST /sales/:id/open-drawer y "no-sale"
// ====================================================================

export const OpenDrawerSchema = z.object({
  /** Si reason está presente y saleId del path es 'no-sale', requiere
   *  X-Approval-Pin (cajero NO puede abrir cajón sin venta sin aprobación). */
  reason: z.string().min(5).max(200).optional(),
});
export type OpenDrawer = z.infer<typeof OpenDrawerSchema>;

// ====================================================================
// SALE STATUS LOG — read-only (insert-only via trigger DB)
// ====================================================================

export const SaleStatusLogEntrySchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  statusFrom: SaleStatusEnum.nullable(),
  statusTo: SaleStatusEnum,
  userId: z.string().uuid().nullable(),
  userName: z.string().nullable().optional(),
  notes: z.string().nullable(),
  changedAt: z.string().datetime(),
});
export type SaleStatusLogEntry = z.infer<typeof SaleStatusLogEntrySchema>;
