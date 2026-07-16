import { logError } from '../../../lib/client-log';
import { PaymentMethodSettingSchema, type PaymentMethodSetting } from '@pos-tercos/types';
import { z } from 'zod';

const CACHE_KEY = 'pos-enabled-methods';
const ListSchema = z.array(PaymentMethodSettingSchema);

/** Sin red (venta offline) el POS cobra con los métodos base del negocio. */
export const FALLBACK_METHODS: PaymentMethodSetting[] = [
  {
    code: 'CASH',
    name: 'Efectivo',
    enabled: true,
    isCash: true,
    requiresVerification: false,
    reconciliationSource: null,
    isSystem: true,
    sortOrder: 1,
  },
  {
    code: 'TRANSFER',
    name: 'Transferencia',
    enabled: true,
    isCash: false,
    requiresVerification: true,
    reconciliationSource: 'BANCOLOMBIA_CSV',
    isSystem: false,
    sortOrder: 2,
  },
];

/** Último catálogo habilitado conocido (cacheado online), para cobrar offline. */
export function cachedEnabledMethods(): PaymentMethodSetting[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return FALLBACK_METHODS;
    const parsed = ListSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.length > 0 ? parsed.data : FALLBACK_METHODS;
  } catch {
    return FALLBACK_METHODS;
  }
}

/**
 * Métodos de pago habilitados por el admin. Con error/offline cae al cache (o
 * a los defaults) — el cajero nunca se queda sin poder cobrar.
 */
export async function fetchEnabledMethods(): Promise<PaymentMethodSetting[]> {
  try {
    const res = await fetch('/api/payment-methods', { credentials: 'include' });
    if (!res.ok) return cachedEnabledMethods();
    const methods = ListSchema.parse(await res.json());
    if (methods.length === 0) return cachedEnabledMethods();
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(methods));
    } catch {
      /* cache best-effort */
    }
    return methods;
  } catch (err) {
    logError('payment-methods', err);
    return cachedEnabledMethods();
  }
}

export type { PaymentMethodSetting };
