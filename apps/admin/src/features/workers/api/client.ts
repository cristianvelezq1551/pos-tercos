import {
  AddPayrollAdjustmentSchema,
  EmployeePanelSchema,
  PagoReportSchema,
  PayrollAdjustmentSchema,
  PayrollDaySchema,
  PayrollPaymentSchema,
  PayrollWeekPaymentSchema,
  SetPayrollDaySchema,
  WeeklyPayrollReportSchema,
  type AddPayrollAdjustment,
  type EmployeePanel,
  type PagoReport,
  type PayrollAdjustment,
  type PayrollDay,
  type PayrollPayment,
  type PayrollWeekPayment,
  type SetPayrollDay,
  type WeeklyPayrollReport,
} from '@pos-tercos/types';
import { request } from '../../../lib/api-client';

async function requestVoid(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(`/api${path}`, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
}

export function getPaymentPeriod(start?: string): Promise<PagoReport> {
  const qs = start ? `?start=${start}` : '';
  return request(`/workers/period${qs}`, { method: 'GET' }, PagoReportSchema);
}

export function getEmployeePanel(userId: string, year: number, month: number): Promise<EmployeePanel> {
  return request(
    `/workers/panel/${userId}?year=${year}&month=${month}`,
    { method: 'GET' },
    EmployeePanelSchema,
  );
}

/** Header con el PIN de aprobación del Dueño (toda acción de nómina lo exige). */
function pinHeader(pin: string): Record<string, string> {
  return { 'X-Approval-Pin': pin };
}

export function setPayrollDay(userId: string, input: SetPayrollDay, pin: string): Promise<PayrollDay> {
  SetPayrollDaySchema.parse(input);
  return request(
    `/workers/${userId}/day`,
    { method: 'POST', body: JSON.stringify(input), headers: pinHeader(pin) },
    PayrollDaySchema,
  );
}

export function deletePayrollDay(userId: string, date: string, pin: string): Promise<void> {
  return requestVoid(`/workers/${userId}/day?date=${date}`, { method: 'DELETE', headers: pinHeader(pin) });
}

export function addAdjustment(userId: string, input: AddPayrollAdjustment, pin: string): Promise<PayrollAdjustment> {
  AddPayrollAdjustmentSchema.parse(input);
  return request(
    `/workers/${userId}/adjustment`,
    { method: 'POST', body: JSON.stringify(input), headers: pinHeader(pin) },
    PayrollAdjustmentSchema,
  );
}

export function deleteAdjustment(id: string, pin: string): Promise<void> {
  return requestVoid(`/workers/adjustment/${id}`, { method: 'DELETE', headers: pinHeader(pin) });
}

// --- Control de pagos (solo Dueño) ---

/** Marca PAGADO con comprobante (multipart). El backend valida Sat/Sun. */
export async function markPaymentPaid(
  userId: string,
  periodStart: string,
  proof: File,
  pin: string,
  note?: string,
  split?: { cashAmount: number; bankAmount: number },
): Promise<PayrollPayment> {
  const fd = new FormData();
  fd.append('proof', proof);
  fd.append('periodStart', periodStart);
  if (note) fd.append('note', note);
  if (split) {
    fd.append('cashAmount', String(split.cashAmount));
    fd.append('bankAmount', String(split.bankAmount));
  }
  const res = await fetch(`/api/workers/${userId}/payment/paid`, {
    method: 'POST',
    credentials: 'include',
    headers: pinHeader(pin), // sin Content-Type: lo pone el browser con boundary
    body: fd,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return PayrollPaymentSchema.parse((await res.json()) as unknown);
}

export function unmarkPayment(userId: string, periodStart: string, pin: string): Promise<void> {
  return requestVoid(`/workers/${userId}/payment?period=${periodStart}`, {
    method: 'DELETE',
    headers: pinHeader(pin),
  });
}

/** URL del comprobante (binario). Se usa en <img src=...>. */
export function paymentProofUrl(paymentId: string): string {
  return `/api/workers/payment/${paymentId}/proof`;
}

// --- Nómina semanal (DIARIO): abonos parciales por días ---

export function getWeeklyPayroll(week?: string): Promise<WeeklyPayrollReport> {
  const qs = week ? `?week=${week}` : '';
  return request(`/workers/weekly${qs}`, { method: 'GET' }, WeeklyPayrollReportSchema);
}

/** Paga días seleccionados de la semana con comprobante (multipart). El pago se
 *  reparte por bolsillo: cashAmount (efectivo) + bankAmount (cuenta) = total. */
export async function payWeekDays(
  input: {
    userId: string;
    weekStart: string;
    days: string[];
    cashAmount: number;
    bankAmount: number;
    note?: string;
  },
  proof: File,
  pin: string,
): Promise<PayrollWeekPayment> {
  const fd = new FormData();
  fd.append('proof', proof);
  fd.append('payload', JSON.stringify(input));
  const res = await fetch('/api/workers/weekly/pay', {
    method: 'POST',
    credentials: 'include',
    headers: pinHeader(pin),
    body: fd,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return PayrollWeekPaymentSchema.parse((await res.json()) as unknown);
}

export function voidWeekPayment(paymentId: string, pin: string): Promise<void> {
  return requestVoid(`/workers/weekly/payment/${paymentId}/void`, {
    method: 'POST',
    headers: pinHeader(pin),
  });
}

/** URL del comprobante de un abono semanal (binario). */
export function weekPaymentProofUrl(paymentId: string): string {
  return `/api/workers/weekly/payment/${paymentId}/proof`;
}

/** ¿Hoy es sábado o domingo (TZ local del navegador)? Para DEV/QA, el bypass
 *  `NEXT_PUBLIC_PAYROLL_PAYMENT_BYPASS_WEEKEND=1` habilita el botón cualquier
 *  día (el backend debe tener el mismo bypass; si no, devuelve 400). */
export function isPaymentDayToday(): boolean {
  if (process.env.NEXT_PUBLIC_PAYROLL_PAYMENT_BYPASS_WEEKEND === '1') return true;
  const dow = new Date().getDay();
  return dow === 0 || dow === 6;
}
