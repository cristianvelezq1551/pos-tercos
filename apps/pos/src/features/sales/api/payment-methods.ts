import {
  PaymentMethodSettingSchema,
  type PaymentMethod,
  type PaymentMethodSetting,
} from '@pos-tercos/types';
import { z } from 'zod';

/** Sin red (venta offline) el POS cobra con los métodos base del negocio. */
export const FALLBACK_METHODS: PaymentMethod[] = ['CASH', 'TRANSFER'];

/**
 * Métodos de pago habilitados por el admin. Con error/offline cae a los
 * defaults — el cajero nunca se queda sin poder cobrar.
 */
export async function fetchEnabledMethods(): Promise<PaymentMethod[]> {
  try {
    const res = await fetch('/api/payment-methods', { credentials: 'include' });
    if (!res.ok) return FALLBACK_METHODS;
    const rows = z.array(PaymentMethodSettingSchema).parse(await res.json());
    const methods = rows.map((r) => r.method);
    return methods.length > 0 ? methods : FALLBACK_METHODS;
  } catch {
    return FALLBACK_METHODS;
  }
}

export type { PaymentMethodSetting };
