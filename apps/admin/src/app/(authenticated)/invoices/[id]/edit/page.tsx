import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ApiError, serverFetchJson } from '../../../../../lib/api-server';
import { EditDraftScreen } from '../../../../../features/invoices';
import type {
  ExtractedInvoice,
  Invoice,
  Stockable,
  Supplier,
} from '@pos-tercos/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditInvoiceDraftPage({ params }: PageProps) {
  const { id } = await params;

  let invoice: Invoice;
  try {
    invoice = await serverFetchJson<Invoice>(`/invoices/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  if (invoice.status !== 'PENDING_REVIEW') {
    redirect(`/invoices/${id}`);
  }

  // Estrategia: intentar primero la extracción IA cruda guardada en
  // aiExtractionJson (existe para uploads y para clones). Si no hay,
  // sintetizar desde los items persistidos.
  let extraction: ExtractedInvoice;
  try {
    extraction = await serverFetchJson<ExtractedInvoice>(`/invoices/${id}/raw-extraction`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      extraction = synthesizeExtraction(invoice);
    } else {
      throw err;
    }
  }

  const [suppliers, stockables] = await Promise.all([
    serverFetchJson<Supplier[]>('/suppliers'),
    serverFetchJson<Stockable[]>('/inventory/stock?only_active=true'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/invoices/${id}`} className="text-sm text-blue-600 hover:underline">
          ← Volver al detalle
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Editar borrador</h1>
        <p className="mt-1 text-sm text-gray-600">
          Revisá y editá los ítems de esta factura antes de confirmar. El stock se descuenta solo
          al confirmar.
        </p>
      </div>

      <EditDraftScreen
        invoice={invoice}
        extraction={extraction}
        initialSuppliers={suppliers}
        initialStockables={stockables}
      />
    </div>
  );
}

function synthesizeExtraction(invoice: Invoice): ExtractedInvoice {
  return {
    supplierName: invoice.supplierName ?? null,
    supplierNit: null,
    invoiceNumber: invoice.invoiceNumber,
    total: invoice.total,
    iva: invoice.iva,
    items: (invoice.items ?? []).map((it) => ({
      descriptionRaw: it.descriptionRaw,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      total: it.total,
    })),
    warnings:
      (invoice.items?.length ?? 0) === 0
        ? ['No hay extracción IA ni ítems guardados. Empezá agregando filas manualmente.']
        : [],
  };
}
