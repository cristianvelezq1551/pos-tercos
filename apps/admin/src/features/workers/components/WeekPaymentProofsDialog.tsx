'use client';

import { comprobantesDe, type PayrollWeekPayment } from '@pos-tercos/types';
import { PaymentProofsDialog } from '../../../components/PaymentProofsDialog';
import {
  addWeekPaymentProofs,
  removeWeekPaymentProof,
  weekPaymentProofUrl,
} from '../api/client';

/** Comprobantes de un abono de nómina. Son OPCIONALES: un abono se puede
 *  registrar sin foto, así que la lista puede quedar vacía. */
export function WeekPaymentProofsDialog({
  payment,
  onClose,
  onChanged,
}: {
  payment: PayrollWeekPayment;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const anulado = payment.status === 'VOIDED';
  return (
    <PaymentProofsDialog
      title="Comprobantes del abono"
      description={`Días ${payment.paidDays.map((d) => d.slice(8, 10)).join(', ')}`}
      initialCount={comprobantesDe(payment)}
      proofUrl={(i) => weekPaymentProofUrl(payment.id, i)}
      puedeQuedarVacio
      readOnly={anulado}
      onAdd={async (files) => comprobantesDe(await addWeekPaymentProofs(payment.id, files))}
      onRemove={async (i) => comprobantesDe(await removeWeekPaymentProof(payment.id, i))}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
