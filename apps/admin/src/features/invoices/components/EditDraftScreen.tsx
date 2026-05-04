'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ExtractedInvoice,
  Invoice,
  InvoiceDraftResponse,
  Stockable,
  Supplier,
} from '@pos-tercos/types';
import { InvoiceConfirmModal } from './InvoiceConfirmModal';

interface EditDraftScreenProps {
  invoice: Invoice;
  extraction: ExtractedInvoice;
  initialSuppliers: Supplier[];
  initialStockables: Stockable[];
}

/**
 * Pantalla cliente que abre el InvoiceConfirmModal sobre un draft existente.
 * Al cerrar/confirmar redirige al detalle de la factura.
 *
 * Cubre dos casos:
 *  1) Reanudar un draft de upload-photo que no se confirmó (items vacíos,
 *     extracción IA cruda).
 *  2) Editar un draft creado por POST /invoices/from-clone (items con
 *     selección pre-resuelta).
 *
 * FASE 4 ajustes 2.15: ya NO se hace re-fetch on-mount de suppliers +
 * stockables. La página SSR ya los pasa frescos en initialSuppliers/initial-
 * Stockables. El doble fetch on-mount era redundante y agregaba latencia
 * percibida. Si el dueño crea un stockable inline, `onStockableCreated` lo
 * agrega al state local sin necesidad de re-fetch.
 */
export function EditDraftScreen({
  invoice,
  extraction,
  initialSuppliers,
  initialStockables,
}: EditDraftScreenProps) {
  const router = useRouter();
  const [stockables, setStockables] = useState<Stockable[]>(initialStockables);
  const suppliers = initialSuppliers;

  const draft: InvoiceDraftResponse = { invoice, extraction };

  const handleClose = (): void => {
    router.push(`/invoices/${invoice.id}`);
  };

  const handleConfirmed = (): void => {
    router.push(`/invoices/${invoice.id}`);
    router.refresh();
  };

  return (
    <InvoiceConfirmModal
      draft={draft}
      suppliers={suppliers}
      stockables={stockables}
      onClose={handleClose}
      onConfirmed={handleConfirmed}
      onStockableCreated={(item) =>
        setStockables((prev) =>
          [...prev, item].sort((a, b) => a.name.localeCompare(b.name)),
        )
      }
    />
  );
}
