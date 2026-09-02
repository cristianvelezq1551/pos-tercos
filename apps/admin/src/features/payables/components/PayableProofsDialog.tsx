'use client';

import { comprobantesDe, type PayableCommitment } from '@pos-tercos/types';
import { PaymentProofsDialog } from '../../../components/PaymentProofsDialog';
import { addPayableProofs, payableProofUrl, removePayableProof } from '../api/client';

/** Comprobantes de un compromiso pagado. Acá son OPCIONALES: un compromiso se
 *  puede saldar sin foto, así que la lista sí puede quedar vacía. */
export function PayableProofsDialog({
  payable,
  onClose,
  onChanged,
}: {
  payable: PayableCommitment;
  onClose: () => void;
  onChanged?: () => void;
}) {
  return (
    <PaymentProofsDialog
      title="Comprobantes del compromiso"
      description={`${payable.beneficiary} · ${payable.description}`}
      initialCount={comprobantesDe(payable)}
      proofUrl={(i) => payableProofUrl(payable.id, i)}
      puedeQuedarVacio
      onAdd={async (files) => comprobantesDe(await addPayableProofs(payable.id, files))}
      onRemove={async (i) => comprobantesDe(await removePayableProof(payable.id, i))}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
