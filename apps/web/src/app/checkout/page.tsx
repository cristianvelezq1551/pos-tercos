import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CheckoutForm } from '../../features/checkout';
import { CheckoutSteps } from '../../components/CheckoutSteps';
import { BusinessHydrator } from '../../features/business';
import { getMenuServer } from '../../features/catalog';
import { getHeroServer } from '../../features/hero';
import { PromotionsHydrator } from '../../features/promotions';
import { ClosedNotice } from './ClosedNotice';

// El checkout no se renderiza si no se aceptan pedidos: kill-switch (#13) o
// fuera de horario. El API igual rechaza el POST — esto es la cara amable.
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const [menu, hero] = await Promise.all([getMenuServer(), getHeroServer()]);
  const { business } = hero;

  if (!business.acceptingOrders) {
    return <ClosedNotice business={business} />;
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <PromotionsHydrator promotions={menu.promotions} />
      <BusinessHydrator business={business} />
      <header className="flex items-center justify-between border-b border-border px-6 py-4 sm:px-12 lg:px-20">
        <Link
          href="/"
          // -my-2/py-2: crece el área de toque a 44px sin mover el diseño.
          className="-my-2 inline-flex min-h-11 items-center gap-2 py-2 text-sm font-medium text-primary transition-colors hover:text-red-500"
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
