import { MessageCircle } from 'lucide-react';

/**
 * Los tres pasos del pago, contados como PASAN de verdad.
 *
 * Decía "al confirmar, te escribimos por WhatsApp": al revés. Quien abre el
 * chat es el CLIENTE — y desde §7.v26 se abre SOLO al confirmar, sin un botón
 * extra que la mayoría no iba a tocar.
 *
 * Y en domicilio el total todavía no existe cuando confirma: falta que el local
 * cotice el envío, así que prometerle "datos de pago" ahí mismo era mentirle.
 */
const PASOS_RECOGER = [
  'Al confirmar se abre WhatsApp con tu pedido ya escrito: solo lo envías. Los datos para transferir también quedan en pantalla.',
  'Haces la transferencia (Nequi o cuenta bancaria) y nos envías el comprobante por ese mismo chat.',
  'Verificamos el pago y preparamos tu pedido. Te avisamos por WhatsApp cuando esté listo para retirar.',
] as const;

const PASOS_DOMICILIO = [
  'Al confirmar se abre WhatsApp con tu pedido y tu dirección ya escritos: solo lo envías.',
  'Te confirmamos por ese chat el costo del domicilio y el total a pagar. Ahí haces la transferencia y nos envías el comprobante.',
  'Verificamos el pago y preparamos tu pedido. Te avisamos por WhatsApp cuando salga hacia tu dirección.',
] as const;

export function WhatsAppPaymentInfo({ isDelivery = false }: { isDelivery?: boolean }) {
  const pasos = isDelivery ? PASOS_DOMICILIO : PASOS_RECOGER;
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
        {pasos.map((paso, idx) => (
          <li key={idx} className="flex items-start gap-3">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366]/20 text-xs font-bold text-[#25D366]">
              {idx + 1}
            </span>
            <p className="text-sm leading-relaxed text-white/80">{paso}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
