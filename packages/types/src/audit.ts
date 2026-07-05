import { z } from 'zod';

export const AuditActionEnum = z.enum([
  // Auth
  'AUTH_LOGIN',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'AUTH_REFRESH',
  'AUTH_REFRESH_FAILED',
  'AUTH_PASSWORD_CHANGED',

  // Catalog
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_DEACTIVATED',
  'PRODUCT_DELETED',
  'SUBPRODUCT_CREATED',
  'SUBPRODUCT_UPDATED',
  'SUBPRODUCT_DEACTIVATED',
  'SUBPRODUCT_DELETED',
  'INGREDIENT_CREATED',
  'INGREDIENT_UPDATED',
  'INGREDIENT_DEACTIVATED',
  'INGREDIENT_DELETED',
  'RECIPE_UPDATED',

  // Inventory
  'INVENTORY_MOVEMENT_MANUAL',
  'INVENTORY_MOVEMENT_WASTE',
  'INVENTORY_MOVEMENT_INITIAL',
  'INVENTORY_MOVEMENT_PURCHASE',
  'INVENTORY_MOVEMENT_SALE',

  // Sales / cash (FASE 5+)
  'SALE_CREATED',
  'SALE_PAID',
  'SALE_VOIDED',
  'SALE_REFUNDED',
  'CORTESIA_REQUESTED',
  'CORTESIA_APPROVED',
  'CORTESIA_REJECTED',
  'CORTESIA_REVERSED',
  'SALE_STATUS_CHANGED',
  'SALE_MANUAL_DISCOUNT',
  'SALE_SENT_TO_KITCHEN',
  'SALE_SYNCED_OFFLINE',
  'OFFLINE_SYNC_DISCREPANCY',
  'OFFLINE_NEGATIVE_STOCK',
  'DISCOUNT_APPLIED_OVER_THRESHOLD',
  'CASH_DRAWER_OPENED',
  'CASH_DRAWER_OPENED_NO_SALE',
  'SHIFT_OPENED',
  'SHIFT_CLOSED',
  'SHIFT_REOPENED',
  'SHIFT_DISCREPANCY_DETECTED',
  'CASH_MOVEMENT_IN',
  'CASH_MOVEMENT_OUT',
  'CASH_MOVEMENT_UPDATED',
  'CASH_MOVEMENT_DELETED',

  // Promotions (FASE 5+)
  'PROMOTION_CREATED',
  'PROMOTION_UPDATED',
  'PROMOTION_DEACTIVATED',

  // Receipts (FASE 5)
  'RECEIPT_PRINTED',
  'COMANDA_PRINTED',
  'COMANDA_CANCELLED',
  'SALE_ITEMS_EDITED',
  'SALE_PAYMENT_CHANGED',
  'STALE_SALES_SWEPT',
  'OFFLINE_SYNC_CLOCK_DRIFT',
  'OFFLINE_PRICE_DRIFT_DETECTED',
  'RECEIPT_REPRINTED',
  'RECEIPT_GAP_DETECTED',

  // Approvals
  'APPROVAL_GRANTED',
  'APPROVAL_DENIED',
  'APPROVAL_PIN_SET',

  // Idempotency
  'IDEMPOTENCY_HIT',

  // Invoices (parte del ajuste 2.5 — los específicos de invoice)
  'INVOICE_UPLOADED',
  'INVOICE_CONFIRMED',
  'INVOICE_REJECTED',
  'INVOICE_CLONED',
  'INVOICE_DELETED',
  'INVOICE_PAYMENT_MARKED',
  'INVOICE_PAYMENT_UNMARKED',

  // Purchase suggestions (FASE 12.C)
  'PURCHASE_SUGGESTION_CREATED',
  'PURCHASE_SUGGESTION_EVALUATED',
  'PURCHASE_SUGGESTION_ACCEPTED',
  'PURCHASE_SUGGESTION_REJECTED',
  'PURCHASE_SUGGESTION_STALE',
  'PURCHASE_SUGGESTION_SENT_SUPPLIER',
  'PURCHASE_SUGGESTION_SUMMARY_SENT',

  // WhatsApp wa.me semi-automático (FASE 9)
  'WHATSAPP_LINK_OPENED',

  // RRHH / Nómina
  'USER_SALARY_CHANGED',
  'EMPLOYMENT_TERMINATED',
  'PAYROLL_DAY_SET',
  'PAYROLL_ADJUSTMENT_ADDED',
  'PAYROLL_PAYMENT_MARKED',
  'PAYROLL_PAYMENT_UNMARKED',

  // Persistencia reconciliación (FASE 14.D)
  'RECONCILIATION_IMPORTED',

  // Gestión de usuarios (admin)
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DEACTIVATED',
  'USER_REACTIVATED',
  'USER_DELETED',
  'USER_PASSWORD_RESET',
  'USER_PIN_SET',
  'FIXED_COST_CREATED',
  'FIXED_COST_UPDATED',
  'FIXED_COST_DELETED',
  'FIXED_COST_PAYMENT_MARKED',
  'FIXED_COST_PAYMENT_UNMARKED',

  // Producción de subproductos (cocinero o admin registra una tanda).
  // El movimiento de inventario en sí se loggea como INVENTORY_MOVEMENT_*.
  'SUBPRODUCT_PRODUCED',
  'FINANCIAL_ANALYSIS_GENERATED',

  // KDS (bitácora de cocina): tardanza de preparación. Login/logout de la
  // cocina quedan en AUTH_LOGIN/AUTH_LOGOUT del usuario COCINERO.
  'KDS_ORDER_DELAYED',

  // Resumen diario automático al dueño por WhatsApp (cron nocturno).
  'OWNER_DAILY_DIGEST_SENT',
  // Alerta puntual al dueño por WhatsApp (descuadre, void, cajón sin venta,
  // suba de costos). metadata.kind distingue el tipo.
  'OWNER_ALERT_SENT',
  // Conteo físico ciclado registrado (con o sin diferencia).
  'STOCK_COUNT_REGISTERED',
  'STOCK_COUNT_APPROVED',
  'STOCK_COUNT_REJECTED',
  // El admin habilitó/deshabilitó medios de pago del POS.
  'PAYMENT_METHODS_UPDATED',
  // El dueño cambió el día de corte del "mes del negocio".
  'BUSINESS_CONFIG_UPDATED',
  // Pago semanal de nómina (DIARIO) por días seleccionados, con comprobante.
  'PAYROLL_WEEK_PAID',
  // Reverso/anulación de un pago semanal de nómina.
  'PAYROLL_WEEK_PAYMENT_VOIDED',
  // Tesorería: saldos iniciales / fecha de corte.
  'TREASURY_CONFIG_UPDATED',
  // Tesorería: traspaso entre bolsillos.
  'TREASURY_TRANSFER_CREATED',
  // Tesorería: ajuste manual de un bolsillo.
  'TREASURY_ADJUSTMENT_CREATED',
  // Tesorería: anulación de un movimiento.
  'TREASURY_MOVEMENT_VOIDED',
  // Compromisos / cuentas por pagar a personas.
  'PAYABLE_CREATED',
  'PAYABLE_PAID',
  'PAYABLE_CANCELLED',
  // Cocina (app del cocinero): incidencias + checklist apertura/cierre.
  'KITCHEN_INCIDENT_LOGGED',
  'KITCHEN_INCIDENT_RESOLVED',
  'KITCHEN_CHECKLIST_COMPLETED',
  'CHECKLIST_ITEM_CREATED',
  'CHECKLIST_ITEM_UPDATED',
]);
export type AuditAction = z.infer<typeof AuditActionEnum>;

export const AuditLogEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  userFullName: z.string().nullable().optional(),
  userEmail: z.string().email().nullable().optional(),
  action: AuditActionEnum,
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  beforeJson: z.unknown().nullable(),
  afterJson: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string().datetime(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
