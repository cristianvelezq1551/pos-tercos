import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  getWebOrderServer,
  OrderStatusView,
} from '../../../../features/checkout';

export const dynamic = 'force-dynamic';

const BUSINESS_NAME = process.env.NEXT_PUBLIC_BUSINESS_NAME ?? 'TERCOS';

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
      <div className="min-h-dvh bg-background text-foreground">
        <header className="flex items-center justify-between border-b border-border px-6 py-4 sm:px-12 lg:px-20">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-red-500"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Volver al menú
          </Link>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Falta el token de tu pedido
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            La URL del pedido necesita el parámetro <code>?token=</code>. Si la perdiste,
            contacta al local.
          </p>
        </main>
      </div>
    );
  }

  const order = await getWebOrderServer(id, token);
  if (!order) notFound();

  // El backend (GET /web/orders/:id) es la única fuente de las instrucciones
  // de pago. Sobrevive a reload / device distinto / share del URL sin que el
  // web app necesite las env vars de pago.
  const instructions = order.paymentInstructions ?? '';

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4 sm:px-12 lg:px-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-red-500"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Volver al menú
        </Link>
        <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Pedido #{order.receiptNumber}
        </span>
      </header>

      <OrderStatusView
        initial={order}
        token={token}
        paymentInstructions={instructions}
        businessName={BUSINESS_NAME}
      />
    </div>
  );
}
