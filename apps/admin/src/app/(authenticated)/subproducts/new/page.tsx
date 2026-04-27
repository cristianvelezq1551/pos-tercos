import Link from 'next/link';
import { SubproductForm } from '../../../../features/subproducts';

export default function NewSubproductPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/subproducts" className="text-sm text-blue-600 hover:underline">
          ← Volver a subproductos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Nuevo subproducto</h1>
      </div>
      <div className="max-w-2xl">
        <SubproductForm />
      </div>
    </div>
  );
}
