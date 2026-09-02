'use client';

import { comprobantesDe, type Invoice } from '@pos-tercos/types';
import { BUSINESS_TIME_ZONE, Button, Dialog, formatCop } from '@pos-tercos/ui';
import { useState } from 'react';
import { PaymentProofsGallery } from '../../../components/PaymentProofsGallery';
import {
  addInvoicePaymentProofs,
  invoicePaymentProofUrl,
  removeInvoicePaymentProof,
} from '../api/client';

export function InvoiceProofDialog({
  invoice,
  onClose,
  onChanged,
  canManage = true,
}: {
  invoice: Invoice;
  onClose: () => void;
  /** El caller recarga la factura; hasta que llegue, el conteo local manda. */
  onChanged?: () => void;
  canManage?: boolean;
}) {
  // Conteo local: el diálogo se queda abierto tras agregar o quitar, así que
  // tiene que reflejar el cambio sin esperar a que el server component
  // vuelva a renderizar la página.
  const [count, setCount] = useState(() =>
    comprobantesDe({ proofsCount: invoice.paymentProofsCount, hasProof: invoice.hasPaymentProof }),
  );
  const supplier = invoice.supplierName ?? 'Proveedor sin nombre';
  const paidAtLabel = invoice.paidAt
    ? new Date(invoice.paidAt).toLocaleString('es-CO', { timeZone: BUSINESS_TIME_ZONE })
    : '—';

  const refrescar = (nuevo: Invoice): void => {
    setCount(
      comprobantesDe({ proofsCount: nuevo.paymentProofsCount, hasProof: nuevo.hasPaymentProof }),
    );
    onChanged?.();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={count > 1 ? `Comprobantes de pago (${count})` : 'Comprobante de pago'}
      description={`${supplier} · pagado el ${paidAtLabel}${invoice.paymentActorName ? ` · por ${invoice.paymentActorName}` : ''}`}
      maxWidth="max-w-2xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-3">
        <PaymentProofsGallery
          count={count}
          proofUrl={(i) => invoicePaymentProofUrl(invoice.id, i)}
          readOnly={!canManage}
          onAdd={async (files) => refrescar(await addInvoicePaymentProofs(invoice.id, files))}
          onRemove={async (i) => refrescar(await removeInvoicePaymentProof(invoice.id, i))}
        />
        <p className="text-xs text-muted-foreground">
          Total: {formatCop(invoice.total ?? 0)}
          {invoice.paymentNote ? ` · ${invoice.paymentNote}` : ''}
        </p>
      </div>
    </Dialog>
  );
}
