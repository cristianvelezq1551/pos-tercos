/** Etiquetas legibles en español para cada acción del log de auditoría. */
const ACTION_LABELS: Record<string, string> = {
  // Sesión
  AUTH_LOGIN: 'Inició sesión',
  AUTH_LOGIN_FAILED: 'Inicio de sesión fallido',
  AUTH_LOGOUT: 'Cerró sesión',
  AUTH_REFRESH: 'Renovó sesión',
  AUTH_REFRESH_FAILED: 'Fallo al renovar sesión',
  AUTH_PASSWORD_CHANGED: 'Cambió su contraseña',

  // Catálogo
  PRODUCT_CREATED: 'Creó producto',
  PRODUCT_UPDATED: 'Editó producto',
  PRODUCT_DEACTIVATED: 'Desactivó producto',
  SUBPRODUCT_CREATED: 'Creó subproducto',
  SUBPRODUCT_UPDATED: 'Editó subproducto',
  SUBPRODUCT_DEACTIVATED: 'Desactivó subproducto',
  INGREDIENT_CREATED: 'Creó insumo',
  INGREDIENT_UPDATED: 'Editó insumo',
  INGREDIENT_DEACTIVATED: 'Desactivó insumo',
  RECIPE_UPDATED: 'Editó receta',

  // Inventario
  INVENTORY_MOVEMENT_MANUAL: 'Ajuste manual de inventario',
  INVENTORY_MOVEMENT_WASTE: 'Registró merma',
  INVENTORY_MOVEMENT_INITIAL: 'Cargó stock inicial',
  INVENTORY_MOVEMENT_PURCHASE: 'Entrada por compra',
  INVENTORY_MOVEMENT_SALE: 'Salida por venta',

  // Ventas / caja
  SALE_CREATED: 'Creó venta',
  SALE_PAID: 'Cobró venta',
  SALE_VOIDED: 'Anuló venta',
  SALE_REFUNDED: 'Reembolsó venta',
  CORTESIA_REQUESTED: 'Solicitó cortesía',
  CORTESIA_APPROVED: 'Registró cortesía',
  CORTESIA_REJECTED: 'Rechazó cortesía',
  CORTESIA_REVERSED: 'Anuló cortesía',
  SALE_STATUS_CHANGED: 'Cambió estado de venta',
  SALE_SYNCED_OFFLINE: 'Sincronizó venta offline',
  OFFLINE_SYNC_DISCREPANCY: 'Descuadre al sincronizar offline',
  DISCOUNT_APPLIED_OVER_THRESHOLD: 'Aplicó descuento alto',
  CASH_DRAWER_OPENED: 'Abrió el cajón',
  CASH_DRAWER_OPENED_NO_SALE: 'Abrió el cajón sin venta',
  SHIFT_OPENED: 'Abrió caja',
  SHIFT_CLOSED: 'Cerró caja',
  SHIFT_REOPENED: 'Reabrió caja',
  SHIFT_DISCREPANCY_DETECTED: 'Descuadre de caja',
  CASH_MOVEMENT_IN: 'Entrada de efectivo',
  CASH_MOVEMENT_OUT: 'Salida de efectivo',

  // Promociones
  PROMOTION_CREATED: 'Creó promoción',
  PROMOTION_UPDATED: 'Editó promoción',
  PROMOTION_DEACTIVATED: 'Desactivó promoción',

  // Recibos
  RECEIPT_PRINTED: 'Imprimió recibo',
  RECEIPT_REPRINTED: 'Reimprimió recibo',
  RECEIPT_GAP_DETECTED: 'Salto en numeración de recibos',

  // Aprobaciones
  APPROVAL_GRANTED: 'Aprobación concedida (PIN)',
  APPROVAL_DENIED: 'Aprobación denegada (PIN)',
  APPROVAL_PIN_SET: 'Configuró su PIN',

  IDEMPOTENCY_HIT: 'Reintento de una operación ya registrada',

  // Facturas
  INVOICE_UPLOADED: 'Subió factura',
  INVOICE_CONFIRMED: 'Confirmó factura',
  INVOICE_REJECTED: 'Rechazó factura',
  INVOICE_CLONED: 'Clonó factura',
  INVOICE_DELETED: 'Eliminó borrador de factura',

  // Sugerencias de compra
  PURCHASE_SUGGESTION_CREATED: 'Sugerencia de compra creada',
  PURCHASE_SUGGESTION_EVALUATED: 'Evaluó sugerencia (IA)',
  PURCHASE_SUGGESTION_ACCEPTED: 'Aceptó sugerencia de compra',
  PURCHASE_LIST_CREATED: 'Creó una lista de faltantes',
  PURCHASE_LIST_UPDATED: 'Editó una lista de faltantes',
  PURCHASE_LIST_CLOSED: 'Cerró una lista de faltantes',
  PURCHASE_LIST_DELETED: 'Borró una lista de faltantes',
  PURCHASE_LIST_EVALUATED: 'Pidió a la IA revisar una lista de faltantes',
  PURCHASE_SUGGESTION_REJECTED: 'Rechazó sugerencia de compra',
  PURCHASE_SUGGESTION_STALE: 'Sugerencia vencida',

  WHATSAPP_LINK_OPENED: 'Abrió WhatsApp',

  // Personal / Nómina
  USER_SALARY_CHANGED: 'Cambió el salario de un empleado',
  EMPLOYMENT_TERMINATED: 'Terminó el empleo de un usuario',
  PAYROLL_DAY_SET: 'Registró/editó un día de pago',
  PAYROLL_ADJUSTMENT_ADDED: 'Agregó una novedad de nómina',

  RECONCILIATION_IMPORTED: 'Importó reconciliación de pagos',

  // Usuarios
  USER_CREATED: 'Creó usuario',
  USER_UPDATED: 'Editó usuario',
  USER_DEACTIVATED: 'Desactivó usuario',
  USER_REACTIVATED: 'Reactivó usuario',
  USER_DELETED: 'Eliminó usuario',
  USER_PASSWORD_RESET: 'Reseteó contraseña de usuario',
  USER_PIN_SET: 'Configuró PIN de usuario',

  KDS_ORDER_DELAYED: 'Pedido demorado en cocina',

  // Cocina
  SUBPRODUCT_PRODUCED: 'Produjo una tanda',
  INVENTORY_MOVEMENT_WASTE_REVERSED: 'Anuló una merma',
  KITCHEN_CHECKLIST_COMPLETED: 'Cerró una rutina de checklist',
  KITCHEN_INCIDENT_LOGGED: 'Reportó una incidencia de cocina',
  KITCHEN_INCIDENT_RESOLVED: 'Resolvió una incidencia de cocina',
  CHECKLIST_ITEM_CREATED: 'Agregó una tarea al checklist',
  CHECKLIST_ITEM_UPDATED: 'Editó una tarea del checklist',
  STOCK_COUNT_REGISTERED: 'Registró un conteo físico',
  STOCK_COUNT_APPROVED: 'Aprobó un conteo físico',
  STOCK_COUNT_REJECTED: 'Rechazó un conteo físico',
};

/** Etiqueta legible para una acción; cae al código crudo si no está mapeada. */
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
