import { notFound, redirect } from 'next/navigation';
import { Container, PageHeader } from '@pos-tercos/ui';
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
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  if (invoice.status !== 'PENDING_REVIEW') {
    redirect(`/invoices/${id}`);
  }

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
    <>
      <PageHeader
        eyebrow="Compras"
        title="Editar borrador"
        description="Revisa y edita los ítems de esta factura antes de confirmar. Las existencias se descuentan solo al confirmar."
        breadcrumbs={[
          { label: 'Facturas', href: '/invoices' },
          { label: invoice.invoiceNumber ?? 'Factura', href: `/invoices/${id}` },
          { label: 'Editar' },
        ]}
      />
      <Container size="7xl" padY="md">
        <EditDraftScreen
          invoice={invoice}
          extraction={extraction}
          initialSuppliers={suppliers}
          initialStockables={stockables}
        />
      </Container>
    </>
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
      packUnits: null,
      packSizePerUnit: null,
      packSizeMeasure: null,
    })),
    warnings:
      (invoice.items?.length ?? 0) === 0
        ? ['No hay extracción inteligente ni ítems guardados. Empieza agregando filas manualmente.']
        : [],
  };
}
