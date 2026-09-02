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
import { quitarComprobante, subirComprobantes } from '../../../lib/comprobantes';

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
  proofs: File[],
): Promise<PayrollWeekPayment> {
  const fd = new FormData();
  for (const f of proofs) fd.append('proof', await prepararFoto(f, 'payroll-proof'));
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
export function weekPaymentProofUrl(paymentId: string, index = 0): string {
  // El primero conserva la ruta de siempre (ver invoicePaymentProofUrl).
  return index === 0
    ? `/api/workers/weekly/payment/${paymentId}/proof`
    : `/api/workers/weekly/payment/${paymentId}/proof/${index}`;
}

/** Suma comprobantes a un abono ya registrado. */
export function addWeekPaymentProofs(
  paymentId: string,
  files: File[],
): Promise<PayrollWeekPayment> {
  return subirComprobantes(
    `/workers/weekly/payment/${paymentId}/proofs`,
    files,
    PayrollWeekPaymentSchema,
  );
}

export function removeWeekPaymentProof(
  paymentId: string,
  index: number,
): Promise<PayrollWeekPayment> {
  return quitarComprobante(
    `/workers/weekly/payment/${paymentId}/proofs/${index}`,
    PayrollWeekPaymentSchema,
  );
}

// --- Excepciones de día (DIARIO): llegada tarde, ausencia, monto distinto ---

export function setPayrollDay(userId: string, input: SetPayrollDay): Promise<PayrollDay> {
  SetPayrollDaySchema.parse(input);
  return request(`/workers/${userId}/day`, { method: 'POST', body: JSON.stringify(input) }, PayrollDaySchema);
}

export function deletePayrollDay(userId: string, date: string): Promise<void> {
  return requestVoid(`/workers/${userId}/day?date=${date}`, { method: 'DELETE' });
}
