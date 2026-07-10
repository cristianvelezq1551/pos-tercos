import type { PaymentMethod } from '@pos-tercos/types';
import { formatCop } from '@pos-tercos/ui';
import type { SplitResult } from '../components/split/SplitPaymentSection';

export interface CheckoutValidation {
  ok: boolean;
  reason: string | null;
}

export function validateCheckout(input: {
  splitOpen: boolean;
  splitResult: SplitResult | null;
  splitReason: string | null;
  method: PaymentMethod | null;
  cashNum: number;
  doubleVerified: boolean;
  total: number;
}): CheckoutValidation {
  if (input.splitOpen) {
    if (input.splitResult) return { ok: true, reason: null };
    return { ok: false, reason: input.splitReason ?? 'Completá la división de la cuenta' };
  }
  if (!input.method) return { ok: false, reason: 'Elige un método de pago' };
  if (input.method === 'CASH') {
    if (input.cashNum < input.total) {
      return {
        ok: false,
        reason: `Faltan ${formatCop(input.total - input.cashNum)} para completar el pago`,
      };
    }
    return { ok: true, reason: null };
  }
  // Transferencia: solo confirmar que llegó (monto = total exacto).
  if (!input.doubleVerified) {
    return {
      ok: false,
      reason: 'Confirma que la transferencia llegó a la cuenta',
    };
  }
  return { ok: true, reason: null };
}
