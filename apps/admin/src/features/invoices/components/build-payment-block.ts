import type { ConfirmInvoicePayment } from '@pos-tercos/types';
import { uploadPaymentProof } from '../api/client';
import type { ConfirmPaymentState } from './PaymentAtConfirmSection';

/**
 * Resuelve el bloque `payment` del payload de confirmación ("nace pagada").
 * Sube el comprobante si el usuario adjuntó archivo; lanza Error legible si
 * falta (el comprobante es obligatorio). `undefined` = factura queda por pagar.
 */
export async function buildPaymentBlock(
  payment: ConfirmPaymentState,
  hasInvoicePhoto: boolean,
): Promise<ConfirmInvoicePayment | undefined> {
  if (!payment.enabled) return undefined;
  const base = {
    cashAmount: payment.cashAmount,
    bankAmount: payment.bankAmount,
    paidAt: payment.paidAt,
    note: payment.note.trim() || undefined,
  };
  if (hasInvoicePhoto && payment.useInvoicePhoto) {
    return { ...base, useInvoicePhotoAsProof: true };
  }
  if (!payment.proofFile) {
    throw new Error('Adjuntá el comprobante del pago (o destildá "Ya está pagada").');
  }
  const { proofStorageKey } = await uploadPaymentProof(payment.proofFile);
  return { ...base, proofStorageKey };
}
