import type { AuditAction, AuditLogEntry } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';

/** Grupos de la bitácora operativa (caja, cocina, sesiones). */
export interface BitacoraGroup {
  key: string;
  label: string;
  actions: AuditAction[];
}

const CAJA: AuditAction[] = [
  'SHIFT_OPENED',
  'SHIFT_CLOSED',
  'SHIFT_REOPENED',
  'SHIFT_DISCREPANCY_DETECTED',
  'CASH_MOVEMENT_IN',
  'CASH_MOVEMENT_OUT',
];
const ANULACIONES: AuditAction[] = ['SALE_VOIDED', 'SALE_REFUNDED'];
/** Ventas que dejaron el stock en negativo (deuda de inventario). */
const STOCK_FORZADO: AuditAction[] = ['SALE_FORCED_STOCK', 'OFFLINE_NEGATIVE_STOCK'];
const CAJON: AuditAction[] = ['CASH_DRAWER_OPENED', 'CASH_DRAWER_OPENED_NO_SALE'];
const APROBACIONES: AuditAction[] = ['APPROVAL_GRANTED', 'APPROVAL_DENIED', 'APPROVAL_PIN_SET'];
const SESIONES: AuditAction[] = ['AUTH_LOGIN', 'AUTH_LOGIN_FAILED', 'AUTH_LOGOUT'];
/**
 * Cocina: lo que hace el cocinero durante el turno. `KDS_ORDER_DELAYED` ya no se
 * emite (el KDS se eliminó en §7.v10) pero se conserva para leer histórico.
 */
const COCINA: AuditAction[] = [
  'SUBPRODUCT_PRODUCED',
  'INVENTORY_MOVEMENT_WASTE',
  'INVENTORY_MOVEMENT_WASTE_REVERSED',
  'KITCHEN_CHECKLIST_COMPLETED',
  'KITCHEN_INCIDENT_LOGGED',
  'KITCHEN_INCIDENT_RESOLVED',
  'STOCK_COUNT_REGISTERED',
  'STOCK_COUNT_APPROVED',
  'STOCK_COUNT_REJECTED',
  'CHECKLIST_ITEM_CREATED',
  'CHECKLIST_ITEM_UPDATED',
  'KDS_ORDER_DELAYED',
];
const CORTESIAS: AuditAction[] = [
  'CORTESIA_REQUESTED',
  'CORTESIA_APPROVED',
  'CORTESIA_REJECTED',
  'CORTESIA_REVERSED',
];
const PERSONAL: AuditAction[] = [
  'USER_SALARY_CHANGED',
  'EMPLOYMENT_TERMINATED',
  'USER_DELETED',
  'PAYROLL_ADJUSTMENT_ADDED',
  'PAYROLL_DAY_SET',
];

export const BITACORA_GROUPS: BitacoraGroup[] = [
  { key: 'todo', label: 'Todo', actions: [...CAJA, ...ANULACIONES, ...STOCK_FORZADO, ...CORTESIAS, ...CAJON, ...APROBACIONES, ...SESIONES, ...PERSONAL, ...COCINA] },
  { key: 'caja', label: 'Caja', actions: CAJA },
  { key: 'anulaciones', label: 'Anulaciones', actions: ANULACIONES },
  { key: 'stock-forzado', label: 'Stock forzado', actions: STOCK_FORZADO },
  { key: 'cortesias', label: 'Cortesías', actions: CORTESIAS },
  { key: 'cajon', label: 'Cajón', actions: CAJON },
  { key: 'aprobaciones', label: 'Aprobaciones', actions: APROBACIONES },
  { key: 'sesiones', label: 'Sesiones', actions: SESIONES },
  { key: 'personal', label: 'Personal / Nómina', actions: PERSONAL },
  { key: 'cocina', label: 'Cocina', actions: COCINA },
];

export type EventTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface DescribedEvent {
  label: string;
  detail: string | null;
  tone: EventTone;
}

function meta(entry: AuditLogEntry): Record<string, unknown> {
  // Algunos registros dejan el detalle en `afterJson` (los movimientos de
  // inventario que audita su controller) y otros en `metadata`. La bitácora
  // mira los dos: con uno solo, media cocina se veía sin detalle.
  const after = (entry.afterJson && typeof entry.afterJson === 'object'
    ? (entry.afterJson as Record<string, unknown>)
    : {});
  const own = (entry.metadata && typeof entry.metadata === 'object'
    ? (entry.metadata as Record<string, unknown>)
    : {});
  return { ...after, ...own };
}

function cop(n: unknown): string {
  return formatCop(Number(n));
}

/** Traduce una entrada de auditoría a una fila legible de la bitácora. */
export function describeEvent(entry: AuditLogEntry): DescribedEvent {
  const m = meta(entry);
  switch (entry.action) {
    case 'SHIFT_OPENED':
      return { label: 'Abrió caja', detail: `Apertura ${cop(m.openingCash)}`, tone: 'success' };
    case 'SHIFT_CLOSED': {
      const diff = Number(m.difference);
      const tone: EventTone =
        Number.isFinite(diff) && Math.abs(diff) >= 5000 ? 'warning' : 'neutral';
      return {
        label: 'Cerró caja',
        detail: `Contado ${cop(m.countedCash)} · Esperado ${cop(m.expectedCash)} · Dif ${cop(m.difference)}`,
        tone,
      };
    }
    case 'SHIFT_REOPENED':
      return { label: 'Reabrió caja (admin)', detail: null, tone: 'warning' };
    case 'CASH_MOVEMENT_IN':
      return {
        label: 'Entrada de efectivo',
        detail: `${cop(m.amount)}${m.reason ? ` · ${String(m.reason)}` : ''}`,
        tone: 'success',
      };
    case 'CASH_MOVEMENT_OUT':
      return {
        label: 'Salida de efectivo',
        detail: `${cop(m.amount)}${m.reason ? ` · ${String(m.reason)}` : ''}`,
        tone: 'warning',
      };
    case 'SHIFT_DISCREPANCY_DETECTED':
      return { label: 'Descuadre de caja', detail: `Diferencia ${cop(m.difference)}`, tone: 'danger' };
    case 'SALE_VOIDED':
      return {
        label: 'Anuló venta',
        detail: `${m.reason ? `Motivo: ${String(m.reason)}` : 'Sin motivo'}${m.oldStatus ? ` · estado previo: ${String(m.oldStatus)}` : ''}`,
        tone: 'danger',
      };
    case 'SALE_REFUNDED':
      return {
        label: 'Reembolsó venta',
        detail: `${m.reason ? `Motivo: ${String(m.reason)}` : 'Sin motivo'}${m.oldStatus ? ` · estado previo: ${String(m.oldStatus)}` : ''}`,
        tone: 'danger',
      };
    case 'SALE_FORCED_STOCK': {
      // metadata.products = [{ id, name }] — los productos forzados disponibles.
      const products = Array.isArray(m.products) ? (m.products as { name?: unknown }[]) : [];
      const names = products.map((p) => String(p.name ?? '')).filter(Boolean);
      return {
        label: 'Vendió con stock forzado',
        detail:
          (names.length > 0 ? `${names.join(', ')} · ` : '') +
          'el stock quedó en negativo (falta cargar la compra/producción)',
        tone: 'warning',
      };
    }
    case 'OFFLINE_NEGATIVE_STOCK': {
      // metadata.items = [{ entityType, entityId, stock }] — ya resueltos.
      const count = Number(m.count ?? 0);
      return {
        label: 'Venta offline dejó stock en negativo',
        detail: `${count} ${count === 1 ? 'insumo' : 'insumos'} en negativo — revisa Deudas de inventario`,
        tone: 'warning',
      };
    }
    case 'CORTESIA_REQUESTED':
      return {
        label: 'Registró cortesía',
        detail: `${m.quantity ? `${String(m.quantity)}× ` : ''}${m.reason ? String(m.reason) : ''}${m.costAmount != null ? ` · costo ${cop(m.costAmount)}` : ''}`.trim() || null,
        tone: 'warning',
      };
    case 'CORTESIA_APPROVED':
      return {
        label: 'Registró cortesía',
        detail: `${m.quantity ? `${String(m.quantity)}× ` : ''}${m.reason ? String(m.reason) : ''}${m.costAmount != null ? ` · costo ${cop(m.costAmount)}` : ''}`.trim() || null,
        tone: 'warning',
      };
    case 'CORTESIA_REJECTED':
      return {
        label: 'Rechazó cortesía',
        detail: m.note ? `Motivo: ${String(m.note)}` : null,
        tone: 'danger',
      };
    case 'CORTESIA_REVERSED':
      return {
        label: 'Anuló cortesía',
        detail: `${m.costAmount != null ? `Costo ${cop(m.costAmount)}` : ''}${m.note ? ` · ${String(m.note)}` : ''}`.trim() || null,
        tone: 'danger',
      };
    case 'CASH_DRAWER_OPENED':
      return { label: 'Abrió cajón', detail: null, tone: 'neutral' };
    case 'CASH_DRAWER_OPENED_NO_SALE':
      return {
        label: 'Abrió cajón SIN venta',
        detail: m.reason ? `Motivo: ${String(m.reason)}` : null,
        tone: 'warning',
      };
    case 'APPROVAL_GRANTED':
      return { label: 'PIN aprobado', detail: m.reason ? String(m.reason) : null, tone: 'neutral' };
    case 'APPROVAL_DENIED':
      return { label: 'PIN denegado', detail: m.reason ? String(m.reason) : null, tone: 'warning' };
    case 'APPROVAL_PIN_SET':
      return { label: 'Cambió su PIN', detail: null, tone: 'neutral' };
    case 'AUTH_LOGIN':
      return { label: 'Inició sesión', detail: null, tone: 'success' };
    case 'AUTH_LOGOUT':
      return { label: 'Cerró sesión', detail: null, tone: 'neutral' };
    case 'AUTH_LOGIN_FAILED':
      return { label: 'Intento de sesión fallido', detail: null, tone: 'warning' };
    case 'USER_SALARY_CHANGED': {
      const after = (m.after && typeof m.after === 'object' ? (m.after as Record<string, unknown>) : {});
      return {
        label: 'Cambió el salario de un empleado',
        detail: after.salaryAmount != null ? `Nuevo: ${cop(after.salaryAmount)} (${String(after.payType ?? '')})` : null,
        tone: 'warning',
      };
    }
    case 'EMPLOYMENT_TERMINATED':
      return {
        label: 'Terminó el empleo de un usuario',
        detail: m.date ? `Fecha de salida: ${String(m.date)}` : null,
        tone: 'danger',
      };
    case 'USER_DELETED':
      return {
        label: 'Eliminó un usuario',
        detail: m.email ? `${String(m.email)} (${String(m.role ?? '')})` : null,
        tone: 'danger',
      };
    case 'PAYROLL_ADJUSTMENT_ADDED':
      return {
        label: 'Novedad de nómina',
        detail: m.removed ? 'Eliminó una novedad' : `${String(m.concept ?? '')}: ${cop(m.amount)}`,
        tone: 'neutral',
      };
    case 'PAYROLL_DAY_SET':
      return {
        label: 'Día de pago',
        detail: m.removed ? `Quitó ${String(m.workDate ?? '')}` : `${String(m.workDate ?? '')}: ${cop(m.amount)}`,
        tone: 'neutral',
      };
    case 'SUBPRODUCT_PRODUCED':
      return {
        label: 'Produjo una tanda',
        detail: `${String(m.subproductName ?? 'subproducto')}: ${String(m.quantityProduced ?? '?')} ${String(m.unit ?? '')}`.trim(),
        tone: 'success',
      };
    case 'INVENTORY_MOVEMENT_WASTE': {
      // La merma de cocina trae nombre y motivo; la del admin, el movimiento crudo.
      const qty = m.quantity ?? (typeof m.delta === 'number' ? Math.abs(m.delta) : null);
      const que = m.name ? String(m.name) : 'un insumo';
      return {
        label: 'Registró merma',
        detail:
          `${que}${qty != null ? `: ${String(qty)} ${String(m.unit ?? '')}` : ''}` +
          `${m.reason ?? m.notes ? ` · ${String(m.reason ?? m.notes)}` : ''}`.trimEnd(),
        tone: 'warning',
      };
    }
    case 'INVENTORY_MOVEMENT_WASTE_REVERSED':
      return {
        label: 'Anuló una merma',
        detail: m.reason ? `Motivo: ${String(m.reason)}` : null,
        tone: 'neutral',
      };
    case 'KITCHEN_CHECKLIST_COMPLETED':
      return {
        label: m.type === 'CLOSE' ? 'Cerró la rutina de cierre' : 'Cerró la rutina de apertura',
        detail: m.items != null ? `${String(m.items)} tareas` : null,
        tone: 'success',
      };
    case 'KITCHEN_INCIDENT_LOGGED':
      return {
        label: 'Reportó una incidencia',
        detail: `${String(m.category ?? '')}${m.withPhoto ? ' · con foto' : ''}`.trim() || null,
        tone: 'warning',
      };
    case 'KITCHEN_INCIDENT_RESOLVED':
      return { label: 'Resolvió una incidencia', detail: null, tone: 'success' };
    case 'STOCK_COUNT_REGISTERED':
      return {
        label: 'Contó inventario',
        detail: `${String(m.name ?? '')}: contó ${String(m.countedQty ?? '?')}`.trim(),
        tone: 'neutral',
      };
    case 'STOCK_COUNT_APPROVED':
      return { label: 'Aprobó un conteo', detail: null, tone: 'success' };
    case 'STOCK_COUNT_REJECTED':
      return { label: 'Rechazó un conteo', detail: null, tone: 'warning' };
    case 'CHECKLIST_ITEM_CREATED':
      return {
        label: 'Agregó una tarea al checklist',
        detail: m.label ? String(m.label) : null,
        tone: 'neutral',
      };
    case 'CHECKLIST_ITEM_UPDATED':
      return {
        label: m.isActive === false ? 'Quitó una tarea del checklist' : 'Editó una tarea del checklist',
        detail: m.label ? String(m.label) : null,
        tone: 'neutral',
      };
    case 'KDS_ORDER_DELAYED':
      // Histórico: este evento ya no se emite (cocina/KDS eliminados), pero la
      // bitácora lo sigue mostrando para registros previos.
      return {
        label: 'Pedido demorado en cocina (histórico)',
        detail: `Recibo #${String(m.receiptNumber ?? '?')} · ${String(m.elapsedMin ?? '?')} min (umbral ${String(m.thresholdMin ?? 10)})`,
        tone: 'warning',
      };
    default:
      return { label: entry.action, detail: null, tone: 'neutral' };
  }
}
