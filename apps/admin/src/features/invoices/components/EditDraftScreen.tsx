'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ExtractedInvoice,
  Invoice,
  InvoiceDraftResponse,
  Stockable,
  Supplier,
} from '@pos-tercos/types';
import { listStock } from '../../inventory';
import { listSuppliers } from '../utils/suppliers-api';
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
 */
export function EditDraftScreen({
  invoice,
  extraction,
  initialSuppliers,
  initialStockables,
}: EditDraftScreenProps) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [stockables, setStockables] = useState<Stockable[]>(initialStockables);

  // Refresh lookups cuando se monta, por si el usuario creó un supplier
  // o stockable mientras tanto en otra pestaña.
  useEffect(() => {
    Promise.all([listSuppliers(), listStock({ onlyActive: true })])
      .then(([s, items]) => {
        setSuppliers(s);
        setStockables(items);
      })
      .catch(() => {});
  }, []);

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
