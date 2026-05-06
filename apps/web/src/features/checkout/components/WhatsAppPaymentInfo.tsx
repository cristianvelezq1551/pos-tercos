import { MessageCircle } from 'lucide-react';

const STEPS = [
  'Al confirmar, te escribimos por WhatsApp con los datos de cuenta para la transferencia.',
  'Realizas la transferencia (Nequi o cuenta bancaria) y nos envías el comprobante por el mismo chat.',
  'Verificamos el pago y empezamos a preparar tu pedido. Te avisamos cuando esté listo.',
] as const;

export function WhatsAppPaymentInfo() {
  return (
    <section
      aria-label="Pago por transferencia vía WhatsApp"
      className="flex flex-col gap-4 rounded-xl border border-[#2D5A2D] bg-[#1A2E1A] p-5"
    >
      <header className="flex items-center gap-2.5">
        <MessageCircle className="h-5 w-5 text-[#25D366]" strokeWidth={2} />
        <h3 className="text-base font-bold leading-tight text-white">
          Pago por transferencia vía WhatsApp
        </h3>
      </header>
      <ol className="flex flex-col gap-3">
        {STEPS.map((step, idx) => (
          <li key={idx} className="flex items-start gap-3">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366]/20 text-xs font-bold text-[#25D366]">
              {idx + 1}
            </span>
            <p className="text-sm leading-relaxed text-white/80">{step}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
