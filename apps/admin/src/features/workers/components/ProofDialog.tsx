'use client';

import type { PayrollPayment } from '@pos-tercos/types';
import { Button, Dialog, formatCop } from '@pos-tercos/ui';
import { paymentProofUrl } from '../api/client';

export function ProofDialog({
  paymentId,
  workerName,
  payment,
  onClose,
}: {
  paymentId: string;
  workerName: string;
  payment: PayrollPayment;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Comprobante de pago"
      description={`${workerName} · pagado el ${new Date(payment.resolvedAt).toLocaleString('es-CO')}${payment.actorName ? ` · por ${payment.actorName}` : ''}`}
      maxWidth="max-w-2xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex justify-center rounded-lg border border-border bg-muted/30 p-2">
          <img
            src={paymentProofUrl(paymentId)}
            alt="Comprobante de pago"
            className="max-h-[70vh] w-auto rounded"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Monto pagado: {formatCop(payment.amount)}
          {payment.note ? ` · ${payment.note}` : ''}
        </p>
      </div>
    </Dialog>
  );
}
