'use client';

import { PaymentProofsDialog } from '../../../components/PaymentProofsDialog';
import { addFixedCostProofs, fixedCostProofUrl, removeFixedCostProof } from '../api/client';

/** Los comprobantes de un pago de costo fijo: ver, agregar y quitar.
 *  Acá el comprobante es obligatorio, así que nunca puede quedar en cero. */
export function FixedCostProofsDialog(props: {
  paymentId: string;
  title: string;
  description: string;
  initialCount: number;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { paymentId, ...resto } = props;
  return (
    <PaymentProofsDialog
      {...resto}
      proofUrl={(i) => fixedCostProofUrl(paymentId, i)}
      onAdd={(files) => addFixedCostProofs(paymentId, files)}
      onRemove={(i) => removeFixedCostProof(paymentId, i)}
    />
  );
}
