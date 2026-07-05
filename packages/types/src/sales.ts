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

/**
 * Estados que NO cuentan como ingreso ni consumen COGS en reportes/P&G:
 *  - PENDIENTE_PAGO: nunca se cobró.
 *  - CANCELADO_NO_PAGO: pedido web rechazado, jamás se pagó.
 *  - VOID: venta anulada (stock revertido).
 *
 * `CANCELADO_SIN_REEMBOLSO` SÍ es ingreso a propósito: la plata se quedó en el
 * negocio aunque el pedido se canceló (decisión 2026-06-25). Por eso NO está acá.
 *
 * Fuente ÚNICA de verdad: consumida por CogsService y SalesReportsService para
 * que no haya dos listas que puedan divergir.
 */
export const NON_REVENUE_SALE_STATUSES = [
  'PENDIENTE_PAGO',
  'CANCELADO_NO_PAGO',
  'VOID',
] as const satisfies readonly SaleStatus[];

/**
 * Prefijo del `voidReason` cuando un VOID proviene de un REEMBOLSO (la cocina ya
 * preparó/entregó → el stock NO se revierte: el insumo se gastó). A diferencia
 * del void normal (stock revertido, costo neto 0 en el ledger), el reembolso es
 * una pérdida real: su COGS debe contabilizarse en el P&G aunque la venta esté
 * excluida de ingresos. `SalesService.refund` lo escribe; `CogsService.getPnl`
 * lo lee para valorizar la pérdida. Fuente única para que no diverjan.
 */
export const REFUND_VOID_REASON_PREFIX = 'Reembolso:';

export const PaymentMethodEnum = z.enum([
  'CASH',
  'CARD',
  'NEQUI',
  'DAVIPLATA',
  'QR_BANCOLOMBIA',
  'TRANSFER',
]);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

/** Labels canónicos para mostrar al usuario (POS/admin/recibos HTML). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  QR_BANCOLOMBIA: 'QR Bancolombia',
  TRANSFER: 'Transferencia',
};

/**
 * Métodos digitales que requieren doble validación en POS antes de
 * confirmar (architecture.md §5.3): el cajero debe verificar en la app
 * del negocio + comprobante del cliente. Incluye todos excepto CASH.
 */
export const DIGITAL_PAYMENT_METHODS = [
  'CARD',
  'NEQUI',
  'DAVIPLATA',
  'QR_BANCOLOMBIA',
  'TRANSFER',
] as const satisfies readonly PaymentMethod[];

// ====================================================================
// MEDIOS DE PAGO CONFIGURABLES — el admin habilita/deshabilita métodos
// ====================================================================

export const PaymentMethodSettingSchema = z.object({
  method: PaymentMethodEnum,
  enabled: z.boolean(),
  sortOrder: z.number().int(),
});
export type PaymentMethodSetting = z.infer<typeof PaymentMethodSettingSchema>;

export const UpdatePaymentMethodsSchema = z.object({
  methods: z
    .array(z.object({ method: PaymentMethodEnum, enabled: z.boolean() }))
    .min(1)
    .superRefine((arr, ctx) => {
      // El POS no puede quedarse sin formas de cobrar.
      const enabledHere = arr.filter((m) => m.enabled).length;
      if (enabledHere === 0 && arr.length >= 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Debe quedar al menos un medio de pago habilitado.',
        });
      }
    }),
});
export type UpdatePaymentMethods = z.infer<typeof UpdatePaymentMethodsSchema>;

// ====================================================================
// DESCUENTO MANUAL (#5b) — por línea y/o sobre el total
// ====================================================================

export const ManualDiscountKindEnum = z.enum(['FIXED', 'PERCENT']);
export type ManualDiscountKind = z.infer<typeof ManualDiscountKindEnum>;

/**
 * Descuento manual del cajero. EXCLUYENTE con promociones: si la venta trae
 * cualquier descuento manual (línea o total), las promos automáticas se
 * ignoran por completo. Requiere `discountReason` en la venta.
 */
export const ManualDiscountSchema = z
  .object({
    kind: ManualDiscountKindEnum,
    /** FIXED: monto en COP. PERCENT: 0 < value <= 100. */
    value: z.number().positive(),
  })
  .superRefine((d, ctx) => {
    if (d.kind === 'PERCENT' && d.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Un descuento porcentual no puede superar 100%.',
        path: ['value'],
      });
    }
  });
export type ManualDiscount = z.infer<typeof ManualDiscountSchema>;

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
  /** Unidades YA enviadas a cocina (comanda incremental de cuentas abiertas). */
  sentToKitchenQty: z.number().int().nonnegative().default(0),
  /** Descuento manual de la línea (null/ausente = sin descuento manual). */
  manualDiscount: ManualDiscountSchema.nullable().optional(),
});
export type SaleItem = z.infer<typeof SaleItemSchema>;

// ====================================================================
// SALE — wire format (output del backend)
// ====================================================================

/** Pago registrado de una venta (wire). 1 fila en simple, N en dividida. */
export const SalePaymentSchema = z.object({
  id: z.string().uuid(),
  method: PaymentMethodEnum,
  amount: z.number(),
  amountReceived: z.number().nullable(),
  createdAt: z.string().datetime(),
});
export type SalePayment = z.infer<typeof SalePaymentSchema>;

export const SaleSchema = z.object({
  id: z.string().uuid(),
  receiptNumber: z.number().int().positive(),
  type: SaleTypeEnum,
  status: SaleStatusEnum,

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
  /** Cuenta abierta (#3): venta COUNTER que vive sin pagar hasta el cierre. */
  isOpenTab: z.boolean().default(false),
  /** Descuento manual sobre el total (null = sin descuento sobre el total). */
  orderDiscount: ManualDiscountSchema.nullable().optional(),
  /** Monto resultante del descuento sobre el total (0 si no hay). */
  orderDiscountAmount: z.number().nonnegative().default(0),
  /** Motivo del descuento manual (obligatorio si hubo descuento manual). */
  discountReason: z.string().nullable().optional(),
  /** Motivo de anulación (solo cuando status=VOID). */
  voidReason: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable(),
  /** Pagos registrados. >1 elemento = cuenta dividida (paymentMethod null). */
  payments: z.array(SalePaymentSchema).optional(),
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
  /** Descuento manual de la línea (#5b). Exige discountReason en la venta. */
  manualDiscount: ManualDiscountSchema.optional(),
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

    /** Cuenta abierta (#3): solo COUNTER, requiere customerName. */
    openTab: z.boolean().optional(),
    /** Descuento manual sobre el TOTAL (#5b). */
    orderDiscount: ManualDiscountSchema.optional(),
    /** Motivo del descuento manual — obligatorio si hay CUALQUIER descuento manual. */
    discountReason: z.string().min(3).max(200).optional(),
  })
  .superRefine((data, ctx) => {
    const hasManualDiscount =
      data.orderDiscount !== undefined ||
      data.items.some((it) => it.manualDiscount !== undefined);
    if (hasManualDiscount && !data.discountReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El descuento manual requiere un motivo (discountReason).',
        path: ['discountReason'],
      });
    }
    if (data.openTab) {
      if (data.type !== 'COUNTER') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Solo las ventas de mostrador pueden quedar como cuenta abierta.',
          path: ['openTab'],
        });
      }
      if (!data.customerName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Una cuenta abierta requiere el nombre del cliente.',
          path: ['customerName'],
        });
      }
    }
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

/** Una parte de una cuenta DIVIDIDA (modo split de ConfirmPayment). */
export const SalePaymentInputSchema = z
  .object({
    method: PaymentMethodEnum,
    /** Cuánto cubre esta parte. La suma de las partes debe = sales.total. */
    amount: z.number().positive(),
    /** CASH: efectivo recibido para ESTA parte (>= amount → vuelto). */
    amountReceived: z.number().positive().optional(),
    /** Partes digitales: el cajero verificó ESTE comprobante. */
    digitalVerified: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const isDigital = (DIGITAL_PAYMENT_METHODS as readonly PaymentMethod[]).includes(
      data.method,
    );
    if (isDigital && !data.digitalVerified) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La parte en ${data.method} requiere verificar su comprobante (digitalVerified=true)`,
        path: ['digitalVerified'],
      });
    }
    if (data.method === 'CASH' && data.amountReceived !== undefined && data.amountReceived < data.amount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El efectivo recibido no puede ser menor que la parte a cubrir',
        path: ['amountReceived'],
      });
    }
  });
export type SalePaymentInput = z.infer<typeof SalePaymentInputSchema>;

export const MAX_SPLIT_PARTS = 10;

// ====================================================================
// EDIT SALE ITEMS — PATCH /sales/:id/items
// ====================================================================

/**
 * Edición de un pedido YA COBRADO (corrección del mostrador). Reglas server:
 * solo PAGADO/EN_PREPARACION/LISTO_DESPACHO con la caja abierta; si cocina
 * ya lo inició (≠ PAGADO) las líneas de PREPARACIÓN no pueden cambiar (solo
 * reventa directa, ej. bebidas). El backend recalcula precios y stock.
 */
export const EditSaleItemsSchema = z
  .object({
    items: z.array(CreateSaleItemSchema).min(1),
    /** Descuento manual sobre el total: presente = setear, null = quitar,
     *  ausente = conservar el actual de la venta. */
    orderDiscount: ManualDiscountSchema.nullable().optional(),
    /** Motivo del descuento manual (obligatorio si la edición deja descuento). */
    discountReason: z.string().min(3).max(200).optional(),
  })
  .superRefine((data, ctx) => {
    const addsManualDiscount =
      (data.orderDiscount !== undefined && data.orderDiscount !== null) ||
      data.items.some((it) => it.manualDiscount !== undefined);
    if (addsManualDiscount && !data.discountReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El descuento manual requiere un motivo (discountReason).',
        path: ['discountReason'],
      });
    }
  });
export type EditSaleItems = z.infer<typeof EditSaleItemsSchema>;

// ====================================================================
// SEND TO KITCHEN — POST /sales/:id/send-to-kitchen (cuentas abiertas #3)
// ====================================================================

/** Bytes ESC/POS de una variante de comanda (cocina / completa). */
export const ComandaBytesSchema = z.object({
  escposBase64: z.string(),
  /** Líneas con unidades pendientes incluidas en esta variante. */
  itemCount: z.number().int().nonnegative(),
});
export type ComandaBytes = z.infer<typeof ComandaBytesSchema>;

/**
 * Respuesta de enviar la tanda pendiente a cocina: estampa las unidades como
 * enviadas y devuelve las DOS variantes de comanda (solo lo NUEVO) para que
 * el POS las rutee a sus impresoras. `pendingCount===0` → no había nada nuevo
 * (no se imprimió ni estampó nada).
 */
export const SendToKitchenResponseSchema = z.object({
  batch: z.number().int().positive(),
  pendingCount: z.number().int().nonnegative(),
  kitchen: ComandaBytesSchema.nullable(),
  full: ComandaBytesSchema.nullable(),
  receiptNumber: z.number().int().positive(),
});
export type SendToKitchenResponse = z.infer<typeof SendToKitchenResponseSchema>;

// ====================================================================
// CHANGE SALE PAYMENT — PATCH /sales/:id/payment
// ====================================================================

/** Parte del re-registro de pago (la plata YA se cobró; esto reclasifica). */
export const ChangeSalePaymentPartSchema = z.object({
  method: PaymentMethodEnum,
  amount: z.number().positive(),
});
export type ChangeSalePaymentPart = z.infer<typeof ChangeSalePaymentPartSchema>;

/**
 * Cambia el método (o la división) de pago de una venta ya cobrada — para
 * corregir un registro equivocado y evitar descuadres al cierre. Solo con
 * la caja del turno todavía abierta.
 */
export const ChangeSalePaymentSchema = z
  .object({
    /** Modo SIMPLE: todo el total a un único método. */
    method: PaymentMethodEnum.optional(),
    /** Modo DIVIDIDO: partes que suman exactamente el total. */
    payments: z.array(ChangeSalePaymentPartSchema).min(2).max(MAX_SPLIT_PARTS).optional(),
  })
  .superRefine((data, ctx) => {
    const simple = data.method !== undefined;
    const split = data.payments !== undefined;
    if (simple === split) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Indicá `method` (único) O `payments` (dividido), no ambos.',
        path: ['method'],
      });
    }
  });
export type ChangeSalePayment = z.infer<typeof ChangeSalePaymentSchema>;

export const ConfirmPaymentSchema = z
  .object({
    /** Modo SIMPLE (un solo método). Mutuamente excluyente con `payments`. */
    method: PaymentMethodEnum.optional(),
    /** Monto recibido (CASH puede ser > total → vuelto). Para digital === total. */
    amountReceived: z.number().positive().optional(),
    /** Para métodos digitales: confirmación explícita de doble validación
     *  (verificar app del negocio + comprobante cliente). UI obliga true. */
    digitalDoubleVerified: z.boolean().optional(),
    /** Modo DIVIDIDO: 2..N partes que suman exactamente el total de la venta. */
    payments: z.array(SalePaymentInputSchema).min(2).max(MAX_SPLIT_PARTS).optional(),
    notes: z.string().max(200).optional(),
    /** true = actualización retroactiva (offline) → NO avisar al cliente por WhatsApp. */
    silent: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const simple = data.method !== undefined;
    const split = data.payments !== undefined;
    if (simple === split) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Indicá `method` (pago simple) O `payments` (cuenta dividida), no ambos.',
        path: ['method'],
      });
      return;
    }
    if (simple) {
      if (data.amountReceived === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'amountReceived es requerido en pago simple',
          path: ['amountReceived'],
        });
      }
      const isDigital = (DIGITAL_PAYMENT_METHODS as readonly PaymentMethod[]).includes(
        data.method!,
      );
      if (isDigital && !data.digitalDoubleVerified) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${data.method} requires digitalDoubleVerified=true (app del negocio + comprobante cliente)`,
          path: ['digitalDoubleVerified'],
        });
      }
    }
  });
export type ConfirmPayment = z.infer<typeof ConfirmPaymentSchema>;

// ====================================================================
// SYNC OFFLINE — POST /sales/sync-offline (Fase B.3)
// ====================================================================
// Venta cobrada OFFLINE (COUNTER) que el POS sincroniza al recuperar conexión.
// El backend la registra TAL CUAL se cobró (totales VERBATIM, sin recomputar
// promos ni validar soldOut → "gana lo cobrado offline"), le asigna el recibo
// real, descuenta stock y la deja PAGADO (estado terminal de mostrador).
// Idempotente por `localId` (= idempotency key) → cero doble-cobro en reintentos.

export const SyncOfflineLineSchema = z.object({
  productId: z.string().uuid(),
  sizeId: z.string().uuid().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  modifiers: z.array(AppliedModifierSchema).default([]),
  notes: z.string().nullable().optional(),
  lineSubtotal: z.number().nonnegative(),
  lineDiscount: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
  appliedPromotionId: z.string().uuid().nullable(),
});

export const SyncOfflineSaleSchema = z.object({
  /** UUID local generado offline. Se usa como idempotency key. */
  localId: z.string().uuid(),
  /** Número provisional mostrado en el recibo offline (ej. "OFF-7"). */
  provisionalNumber: z.string().min(1).max(32),
  /** Momento real de la venta offline (el backend backdatea paidAt acá). */
  soldOfflineAt: z.string().datetime(),
  payment: z.object({
    method: PaymentMethodEnum,
    amountReceived: z.number().nonnegative(),
    /** El cajero verificó el comprobante en el celular del cliente (sin doble-check de app). */
    offlineVerified: z.boolean(),
  }),
  payload: z.object({
    type: z.literal('COUNTER'),
    customerName: z.string().nullable(),
    lines: z.array(SyncOfflineLineSchema).min(1),
    subtotal: z.number().nonnegative(),
    discount: z.number().nonnegative(),
    total: z.number().nonnegative(),
  }),
});
export type SyncOfflineSale = z.infer<typeof SyncOfflineSaleSchema>;

// ====================================================================
// VOID SALE — POST /sales/:id/void (X-Approval-Pin obligatorio)
// ====================================================================

export const VoidSaleSchema = z.object({
  /** Motivo obligatorio (audit). 5-200 chars. */
  reason: z.string().min(5).max(200),
});
export type VoidSale = z.infer<typeof VoidSaleSchema>;

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
