import Link from 'next/link';
import { CheckoutForm } from '../../features/checkout';

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-gray-200 bg-white px-4">
        <Link
          href="/"
          className="text-sm font-medium text-blue-700 hover:text-blue-900"
        >
          ← Volver al menú
        </Link>
      </header>
      <main className="mx-auto max-w-md p-4">
        <h1 className="text-2xl font-bold tracking-tight">Finalizar pedido</h1>
        <p className="mt-1 text-sm text-gray-600">
          Completá tus datos. Te mostramos cómo pagar en el siguiente paso.
        </p>
        <div className="mt-6">
          <CheckoutForm />
        </div>
      </main>
    </div>
  );
}
