import {
  PaymentMethodSettingSchema,
  type CreatePaymentMethod,
  type PaymentMethodSetting,
  type UpdatePaymentMethod,
} from '@pos-tercos/types';
import { z } from 'zod';

const ListSchema = z.array(PaymentMethodSettingSchema);

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? `Error ${res.status}`;
}

export async function listAllPaymentMethods(): Promise<PaymentMethodSetting[]> {
  const res = await fetch('/api/payment-methods/all', { credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
  return ListSchema.parse(await res.json());
}

export async function createPaymentMethod(
  input: CreatePaymentMethod,
): Promise<PaymentMethodSetting> {
  const res = await fetch('/api/payment-methods', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await readError(res));
  return PaymentMethodSettingSchema.parse(await res.json());
}

export async function updatePaymentMethod(
  code: string,
  input: UpdatePaymentMethod,
): Promise<PaymentMethodSetting> {
  const res = await fetch(`/api/payment-methods/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await readError(res));
  return PaymentMethodSettingSchema.parse(await res.json());
}

export async function deletePaymentMethod(code: string): Promise<void> {
  const res = await fetch(`/api/payment-methods/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await readError(res));
}
