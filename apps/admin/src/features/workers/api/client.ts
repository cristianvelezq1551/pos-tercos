import {
  AddPayrollAdjustmentSchema,
  EmployeePanelSchema,
  PagoReportSchema,
  PayrollAdjustmentSchema,
  PayrollDaySchema,
  PayrollPaymentSchema,
  SetPayrollDaySchema,
  type AddPayrollAdjustment,
  type EmployeePanel,
  type PagoReport,
  type PayrollAdjustment,
  type PayrollDay,
  type PayrollPayment,
  type SetPayrollDay,
} from '@pos-tercos/types';
import { z } from 'zod';

async function request<T>(path: string, init: RequestInit, schema: z.ZodSchema<T>): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return schema.parse((await res.json()) as unknown);
}

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
): Promise<PayrollPayment> {
  const fd = new FormData();
  fd.append('proof', proof);
  fd.append('periodStart', periodStart);
  if (note) fd.append('note', note);
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

/** ¿Hoy es sábado o domingo (TZ local del navegador)? Para DEV/QA, el bypass
 *  `NEXT_PUBLIC_PAYROLL_PAYMENT_BYPASS_WEEKEND=1` habilita el botón cualquier
 *  día (el backend debe tener el mismo bypass; si no, devuelve 400). */
export function isPaymentDayToday(): boolean {
  if (process.env.NEXT_PUBLIC_PAYROLL_PAYMENT_BYPASS_WEEKEND === '1') return true;
  const dow = new Date().getDay();
  return dow === 0 || dow === 6;
}
