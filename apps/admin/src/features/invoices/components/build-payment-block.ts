import type { ConfirmInvoicePayment } from '@pos-tercos/types';
import { uploadPaymentProof } from '../api/client';
import type { ConfirmPaymentState } from './PaymentAtConfirmSection';

/**
 * Resuelve el bloque `payment` del payload de confirmación ("nace pagada").
 * Sube los comprobantes que el usuario adjuntó; lanza Error legible si no hay
 * ninguna fuente (al menos una es obligatoria). `undefined` = queda por pagar.
 *
 * La foto de la factura y las capturas se pueden combinar: la primera es el
 * documento y las otras el soporte del pago.
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
  const usaFoto = hasInvoicePhoto && payment.useInvoicePhoto;
  if (!usaFoto && payment.proofFiles.length === 0) {
    throw new Error('Adjunta el comprobante del pago (o desmarca "Ya está pagada").');
  }
  const subidas = await Promise.all(
    payment.proofFiles.map((f) => uploadPaymentProof(f).then((r) => r.proofStorageKey)),
  );
  return {
    ...base,
    ...(usaFoto ? { useInvoicePhotoAsProof: true } : {}),
    ...(subidas.length > 0 ? { proofStorageKeys: subidas } : {}),
  };
}
