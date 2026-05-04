import {
  CheckInSchema,
  CheckOutSchema,
  CreateCommissionSchema,
  PayrollPeriodReportSchema,
  WorkerAttendanceSchema,
  WorkerCommissionSchema,
  type CheckIn,
  type CheckOut,
  type CreateCommission,
  type PayrollPeriodReport,
  type WorkerAttendance,
  type WorkerCommission,
} from '@pos-tercos/types';
import { z } from 'zod';

const AttendanceList = z.array(WorkerAttendanceSchema);
const CommissionList = z.array(WorkerCommissionSchema);

async function request<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodSchema<T>,
): Promise<T> {
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
  const json = (await res.json()) as unknown;
  return schema.parse(json);
}

export function listAttendance(opts: {
  userId?: string;
  from?: string;
  to?: string;
  onlyOpen?: boolean;
} = {}): Promise<WorkerAttendance[]> {
  const qs = new URLSearchParams();
  if (opts.userId) qs.set('user_id', opts.userId);
  if (opts.from) qs.set('from', opts.from);
  if (opts.to) qs.set('to', opts.to);
  if (opts.onlyOpen) qs.set('only_open', 'true');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request(`/workers/attendance${suffix}`, { method: 'GET' }, AttendanceList);
}

export function checkIn(userId: string, input: CheckIn = {}): Promise<WorkerAttendance> {
  CheckInSchema.parse(input);
  return request(
    `/workers/${userId}/check-in`,
    { method: 'POST', body: JSON.stringify(input) },
    WorkerAttendanceSchema,
  );
}

export function checkOut(
  attendanceId: string,
  input: CheckOut = {},
): Promise<WorkerAttendance> {
  CheckOutSchema.parse(input);
  return request(
    `/workers/attendance/${attendanceId}/check-out`,
    { method: 'POST', body: JSON.stringify(input) },
    WorkerAttendanceSchema,
  );
}

export function listCommissions(userId?: string): Promise<WorkerCommission[]> {
  const qs = userId ? `?user_id=${userId}` : '';
  return request(`/workers/commissions${qs}`, { method: 'GET' }, CommissionList);
}

export function createCommission(
  userId: string,
  input: CreateCommission,
): Promise<WorkerCommission> {
  CreateCommissionSchema.parse(input);
  return request(
    `/workers/${userId}/commission`,
    { method: 'POST', body: JSON.stringify(input) },
    WorkerCommissionSchema,
  );
}

export function getPayrollPeriod(
  from: string,
  to: string,
): Promise<PayrollPeriodReport> {
  return request(
    `/workers/payroll-period?from=${from}&to=${to}`,
    { method: 'GET' },
    PayrollPeriodReportSchema,
  );
}
