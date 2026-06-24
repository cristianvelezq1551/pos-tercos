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
const CAJON: AuditAction[] = ['CASH_DRAWER_OPENED', 'CASH_DRAWER_OPENED_NO_SALE'];
const APROBACIONES: AuditAction[] = ['APPROVAL_GRANTED', 'APPROVAL_DENIED', 'APPROVAL_PIN_SET'];
const SESIONES: AuditAction[] = ['AUTH_LOGIN', 'AUTH_LOGIN_FAILED', 'AUTH_LOGOUT'];
const COCINA: AuditAction[] = ['KDS_ORDER_DELAYED'];
const PERSONAL: AuditAction[] = [
  'USER_SALARY_CHANGED',
  'EMPLOYMENT_TERMINATED',
  'USER_DELETED',
  'PAYROLL_ADJUSTMENT_ADDED',
  'PAYROLL_DAY_SET',
];

export const BITACORA_GROUPS: BitacoraGroup[] = [
  { key: 'todo', label: 'Todo', actions: [...CAJA, ...ANULACIONES, ...CAJON, ...APROBACIONES, ...SESIONES, ...PERSONAL, ...COCINA] },
  { key: 'caja', label: 'Caja', actions: CAJA },
  { key: 'anulaciones', label: 'Anulaciones', actions: ANULACIONES },
  { key: 'cajon', label: 'Cajón', actions: CAJON },
  { key: 'aprobaciones', label: 'Aprobaciones', actions: APROBACIONES },
  { key: 'sesiones', label: 'Sesiones', actions: SESIONES },
  { key: 'personal', label: 'Personal / Nómina', actions: PERSONAL },
  { key: 'cocina', label: 'Cocina (KDS)', actions: COCINA },
];

export type EventTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface DescribedEvent {
  label: string;
  detail: string | null;
  tone: EventTone;
}

function meta(entry: AuditLogEntry): Record<string, unknown> {
  return (entry.metadata && typeof entry.metadata === 'object'
    ? (entry.metadata as Record<string, unknown>)
    : {});
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
    case 'KDS_ORDER_DELAYED':
      return {
        label: 'Pedido demorado en cocina',
        detail: `${m.turnNumber ? `Turno ${String(m.turnNumber)} · ` : ''}${String(m.elapsedMin ?? '?')} min (umbral ${String(m.thresholdMin ?? 10)})`,
        tone: 'warning',
      };
    default:
      return { label: entry.action, detail: null, tone: 'neutral' };
  }
}
