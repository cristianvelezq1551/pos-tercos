import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { BusinessHydrator } from '../../../../features/business';
import {
  getWebOrderServer,
  OrderStatusView,
} from '../../../../features/checkout';
import { getHeroServer } from '../../../../features/hero';

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
      <MessageScreen
        title="Falta el token de tu pedido"
        description="La URL del pedido necesita el parámetro ?token=. Si la perdiste, contacta al local por WhatsApp."
      />
    );
  }

  const result = await getWebOrderServer(id, token);

  if (!result.ok) {
    if (result.reason === 'not_found') notFound();
    if (result.reason === 'expired') {
      return (
        <MessageScreen
          title="Tu enlace ya no es válido"
          description="El enlace de seguimiento dura 24 horas. Si tu pedido es reciente, contacta al local por WhatsApp y te ayudamos con el estado."
        />
      );
    }
    return (
      <MessageScreen
        title="No pudimos cargar tu pedido"
        description="Tuvimos un problema momentáneo. Recargá la página en unos segundos; si sigue fallando, contacta al local por WhatsApp."
      />
    );
  }

  const order = result.order;
  // El botón de WhatsApp necesita el teléfono del negocio, que vive en la
  // config: sin hidratar el store, no se renderiza.
  const { business } = await getHeroServer();

  // El backend (GET /web/orders/:id) es la única fuente de las instrucciones
  // de pago. Sobrevive a reload / device distinto / share del URL sin que el
  // web app necesite las env vars de pago.
  const instructions = order.paymentInstructions ?? '';

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <BusinessHydrator business={business} />
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

function MessageScreen({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
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
        <h1 className="font-display text-2xl font-bold text-foreground">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </main>
    </div>
  );
}
