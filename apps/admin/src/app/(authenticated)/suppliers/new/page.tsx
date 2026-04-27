import Link from 'next/link';
import { SupplierForm } from '../../../../features/suppliers';

export default function NewSupplierPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/suppliers" className="text-sm text-blue-600 hover:underline">
          ← Volver a proveedores
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Nuevo proveedor</h1>
      </div>
      <div className="max-w-2xl">
        <SupplierForm />
      </div>
    </div>
  );
}
