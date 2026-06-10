'use client';

import type { Invoice } from '@pos-tercos/types';
import { Button, Dialog, formatCop } from '@pos-tercos/ui';
import { invoicePaymentProofUrl } from '../api/client';

export function InvoiceProofDialog({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  const supplier = invoice.supplierName ?? 'Proveedor sin nombre';
  const paidAtLabel = invoice.paidAt
    ? new Date(invoice.paidAt).toLocaleString('es-CO')
    : '—';
  return (
    <Dialog
      open
      onClose={onClose}
      title="Comprobante de pago"
      description={`${supplier} · pagado el ${paidAtLabel}${invoice.paymentActorName ? ` · por ${invoice.paymentActorName}` : ''}`}
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
            src={invoicePaymentProofUrl(invoice.id)}
            alt="Comprobante de pago"
            className="max-h-[70vh] w-auto rounded"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Total: {formatCop(invoice.total ?? 0)}
          {invoice.paymentNote ? ` · ${invoice.paymentNote}` : ''}
        </p>
      </div>
    </Dialog>
  );
}
