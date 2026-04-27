import Link from 'next/link';
import { ProductForm } from '../../../../features/products';

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/products" className="text-sm text-blue-600 hover:underline">
          ← Volver a productos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Nuevo producto</h1>
      </div>
      <div className="max-w-2xl">
        <ProductForm />
      </div>
    </div>
  );
}
