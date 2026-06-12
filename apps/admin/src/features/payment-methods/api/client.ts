import {
  PaymentMethodSettingSchema,
  type PaymentMethodSetting,
  type UpdatePaymentMethods,
} from '@pos-tercos/types';
import { z } from 'zod';

const ListSchema = z.array(PaymentMethodSettingSchema);

export async function listAllPaymentMethods(): Promise<PaymentMethodSetting[]> {
  const res = await fetch('/api/payment-methods/all', { credentials: 'include' });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return ListSchema.parse(await res.json());
}

export async function updatePaymentMethods(
  input: UpdatePaymentMethods,
): Promise<PaymentMethodSetting[]> {
  const res = await fetch('/api/payment-methods', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Error ${res.status}`);
  }
  return ListSchema.parse(await res.json());
}
