import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CheckoutForm } from '../../features/checkout';
import { CheckoutSteps } from '../../components/CheckoutSteps';

export default function CheckoutPage() {
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
