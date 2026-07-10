import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CheckoutForm } from '../../features/checkout';
import { CheckoutSteps } from '../../components/CheckoutSteps';
import { getMenuServer } from '../../features/catalog';
import { PromotionsHydrator } from '../../features/promotions';

// Kill-switch (#13): si el dueño apagó los pedidos web, el checkout no se
// renderiza (el API igual rechaza el POST — esto es la cara amable).
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const menu = await getMenuServer();
  if (!menu.webOrdersEnabled) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <h1 className="font-display text-3xl font-extrabold">Pedidos online pausados</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Los pedidos por la web están temporalmente deshabilitados. ¡Te esperamos en el
          local!
        </p>
        <Link href="/" className="text-sm font-semibold text-primary hover:underline">
          ← Volver al menú
        </Link>
      </div>
    );
  }
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <PromotionsHydrator promotions={menu.promotions} />
      <header className="flex items-center justify-between border-b border-border px-6 py-4 sm:px-12 lg:px-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-red-500"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Volver al menú
        </Link>
      </header>

      <CheckoutSteps current={1} />

      <section className="border-y border-border px-6 py-10 sm:px-12 lg:px-20">
        <div className="mx-auto max-w-[520px] flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Paso 1 · Datos
          </p>
          <h1 className="font-display text-4xl font-extrabold leading-tight text-foreground sm:text-5xl">
            Finalizar pedido
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Completa tus datos y te enviaremos un mensaje por WhatsApp para coordinar el
            pago por transferencia.
          </p>
        </div>
      </section>

      <main className="px-6 py-10 pb-12 sm:px-12 lg:px-20">
        <div className="mx-auto max-w-[520px]">
          <CheckoutForm />
        </div>
      </main>
    </div>
  );
}
