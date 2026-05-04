import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  buildPaymentInstructions,
  getWebOrderServer,
  OrderStatusView,
} from '../../../../features/checkout';

export const dynamic = 'force-dynamic';

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  if (!token) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold">Falta el token de tu pedido</h1>
        <p className="mt-2 max-w-md text-sm text-gray-600">
          La URL del pedido necesita el parámetro <code>?token=</code>. Si la perdiste, contactá
          al local.
        </p>
        <Link href="/" className="mt-6 text-sm font-medium text-blue-700 hover:text-blue-900">
          Volver al menú
        </Link>
      </main>
    );
  }

  const order = await getWebOrderServer(id, token);
  if (!order) notFound();

  const instructions = buildPaymentInstructions(order);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
        <span className="text-sm font-semibold text-gray-700">Tu pedido</span>
        <Link
          href="/"
          className="text-sm font-medium text-blue-700 hover:text-blue-900"
        >
          Hacer otro pedido
        </Link>
      </header>
      <main className="mx-auto max-w-md p-4">
        <OrderStatusView initial={order} token={token} paymentInstructions={instructions} />
      </main>
    </div>
  );
}
