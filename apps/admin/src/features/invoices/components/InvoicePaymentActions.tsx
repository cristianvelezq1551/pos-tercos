'use client';

import type { Invoice } from '@pos-tercos/types';
import { Badge, Button } from '@pos-tercos/ui';
import { CheckCircle2, Eye, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { InvoiceMarkPaidDialog } from './InvoiceMarkPaidDialog';
import { InvoiceProofDialog } from './InvoiceProofDialog';
import { InvoiceUnmarkDialog } from './InvoiceUnmarkDialog';

/** Acciones de pago al proveedor. Compacto = icon-only (para tablas);
 *  default = botones con texto. El caller decide qué habilita cada gate:
 *  `canManage` = marcar/desmarcar (Dueño o el admin que creó la factura),
 *  `canViewProof` = ver comprobante (cualquier admin). */
export function InvoicePaymentActions({
  invoice,
  onChanged,
  compact = false,
  canManage = true,
  canViewProof = true,
}: {
  invoice: Invoice;
  onChanged: () => void;
  compact?: boolean;
  canManage?: boolean;
  canViewProof?: boolean;
}) {
  const [modal, setModal] = useState<'paid' | 'unmark' | 'proof' | null>(null);

  // Solo aplica a facturas CONFIRMED. PENDING_REVIEW/REJECTED no se pagan.
  if (invoice.status !== 'CONFIRMED' || invoice.paymentStatus === null) {
    return <Badge tone="neutral" size="sm">—</Badge>;
  }

  const close = (): void => setModal(null);
  const refreshAndClose = (): void => {
    close();
    onChanged();
  };

  const isPaid = invoice.paymentStatus === 'PAID';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isPaid ? (
        <Badge tone="success" size="sm">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Pagada
        </Badge>
      ) : (
        <Badge tone="warning" size="sm">Por pagar</Badge>
      )}

      {!isPaid ? (
        canManage ? (
          compact ? (
            <Button
              size="sm"
              variant="default"
              onClick={() => setModal('paid')}
              aria-label="Marcar pagada"
              title="Subir comprobante y marcar pagada"
              className="-my-1 h-7 px-2"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="default" onClick={() => setModal('paid')}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Marcar pagada
            </Button>
          )
        ) : null
      ) : (
        <>
          {invoice.hasPaymentProof && canViewProof ? (
            compact ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setModal('proof')}
                title="Ver comprobante"
                aria-label="Ver comprobante"
                className="-my-1 h-7 px-2"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setModal('proof')}>
                <Eye className="h-3.5 w-3.5" /> Ver comprobante
              </Button>
            )
          ) : null}
          {canManage ? (
            compact ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setModal('unmark')}
                title="Desmarcar pago"
                aria-label="Desmarcar"
                className="-my-1 h-7 px-2"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setModal('unmark')}>
                Desmarcar
              </Button>
            )
          ) : null}
        </>
      )}

      {modal === 'paid' && (
        <InvoiceMarkPaidDialog invoice={invoice} onClose={close} onSuccess={refreshAndClose} />
      )}
      {modal === 'unmark' && (
        <InvoiceUnmarkDialog invoice={invoice} onClose={close} onSuccess={refreshAndClose} />
      )}
      {modal === 'proof' && (
        <InvoiceProofDialog
          invoice={invoice}
          onClose={close}
          onChanged={onChanged}
          canManage={canManage}
        />
      )}
    </div>
  );
}
