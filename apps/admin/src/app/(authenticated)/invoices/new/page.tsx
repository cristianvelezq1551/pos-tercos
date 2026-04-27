import Link from 'next/link';
import { InvoiceUploader } from '../../../../features/invoices';

export default function NewInvoicePage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/invoices" className="text-sm text-blue-600 hover:underline">
          ← Volver a facturas
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Nueva factura</h1>
        <p className="mt-1 text-sm text-gray-600">
          Subí una foto de factura del proveedor. La IA extrae los datos y abre un modal donde podés
          editar todo antes de confirmar.
        </p>
      </div>
      <div className="max-w-3xl">
        <InvoiceUploader />
      </div>
    </div>
  );
}
