import {
  PayrollAdjustmentSchema,
  PayrollDaySchema,
  PayrollWeekPaymentSchema,
  SetPayrollDaySchema,
  WeeklyPayrollReportSchema,
  type PayrollAdjustment,
  type PayrollDay,
  type PayrollWeekPayment,
  type SetPayrollDay,
  type WeeklyPayrollReport,
} from '@pos-tercos/types';
import { request } from '../../../lib/api-client';
import { prepararFoto } from '../../../lib/subir-archivo';

async function requestVoid(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(`/api${path}`, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
}

// --- Nómina semanal: abonos parciales por días ---

export function getWeeklyPayroll(week?: string): Promise<WeeklyPayrollReport> {
  const qs = week ? `?week=${week}` : '';
  return request(`/workers/weekly${qs}`, { method: 'GET' }, WeeklyPayrollReportSchema);
}

/** Paga días seleccionados de la semana (multipart). El comprobante es opcional.
 *  El pago se reparte por bolsillo: cashAmount (efectivo) + bankAmount (cuenta) = total. */
export async function payWeekDays(
  input: {
    userId: string;
    weekStart: string;
    days: string[];
    cashAmount: number;
    bankAmount: number;
    note?: string;
  },
  proof: File | null,
): Promise<PayrollWeekPayment> {
  const fd = new FormData();
  if (proof) fd.append('proof', await prepararFoto(proof, 'payroll-proof'));
  fd.append('payload', JSON.stringify(input));
  const res = await fetch('/api/workers/weekly/pay', {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return PayrollWeekPaymentSchema.parse((await res.json()) as unknown);
}

export function voidWeekPayment(paymentId: string): Promise<void> {
  return requestVoid(`/workers/weekly/payment/${paymentId}/void`, { method: 'POST' });
}

/** Agrega un bono/descuento a la semana de un empleado. */
export function addWeeklyAdjustment(input: {
  userId: string;
  weekStart: string;
  concept: string;
  amount: number;
  note?: string;
}): Promise<PayrollAdjustment> {
  return request(
    '/workers/weekly/adjustment',
    { method: 'POST', body: JSON.stringify(input) },
    PayrollAdjustmentSchema,
  );
}

export function deleteWeeklyAdjustment(adjustmentId: string): Promise<void> {
  return requestVoid(`/workers/weekly/adjustment/${adjustmentId}`, { method: 'DELETE' });
}

/** URL del comprobante de un abono semanal (binario). */
export function weekPaymentProofUrl(paymentId: string): string {
  return `/api/workers/weekly/payment/${paymentId}/proof`;
}

// --- Excepciones de día (DIARIO): llegada tarde, ausencia, monto distinto ---

export function setPayrollDay(userId: string, input: SetPayrollDay): Promise<PayrollDay> {
  SetPayrollDaySchema.parse(input);
  return request(`/workers/${userId}/day`, { method: 'POST', body: JSON.stringify(input) }, PayrollDaySchema);
}

export function deletePayrollDay(userId: string, date: string): Promise<void> {
  return requestVoid(`/workers/${userId}/day?date=${date}`, { method: 'DELETE' });
}
