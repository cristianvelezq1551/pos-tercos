'use client';

import { buildWebOrderLink } from '@pos-tercos/domain';
import type { PublicWebOrder } from '@pos-tercos/types';
import { MessageCircle } from 'lucide-react';
import { useBusiness } from '../../business';

/**
 * RESPALDO para reabrir el chat con el pedido ya escrito.
 *
 * Desde §7.v26 el chat se abre SOLO al confirmar el pedido (dentro del gesto
 * del cliente, en `CheckoutForm`): un botón aparte era un paso más que la
 * mayoría no iba a dar, y sin ese mensaje el pedido quedaba esperando a que el
 * cajero se acordara de escribir.
 *
 * Este queda para cuando esa apertura no ocurrió —bloqueador de pop-ups, la
 * pestaña se cerró, el cliente volvió al link horas después— y por eso está en
 * tono secundario: no es la acción principal de la pantalla.
 *
 * NO envía nada: deja el mensaje escrito y el cliente toca enviar.
 */
export function SendOrderByWhatsApp({ order }: { order: PublicWebOrder }) {
  const phone = useBusiness((s) => s.business.contact.phone);

  const link = buildWebOrderLink({
    businessPhone: phone,
    receiptNumber: order.receiptNumber,
    customerName: order.customerName,
    items: order.items.map((it) => ({
      productName: it.productName,
      sizeName: it.sizeName,
      quantity: it.quantity,
      modifiers: it.modifiers,
      notes: it.notes,
    })),
    total: order.total,
    deliveryAddress: order.deliveryAddress,
    deliveryNotes: order.deliveryNotes,
    notes: order.notes,
  });

  // §3.6: sin teléfono configurado (o SSR del hero caído) no hay a dónde
  // escribir. Antes devolvía null → si además faltaba el envío, la pantalla
  // quedaba SIN ningún call-to-action (dead-end). Mostramos un reaseguro:
  // el local igual contacta al cliente.
  if (!link) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
        Te vamos a escribir por WhatsApp para coordinar el pago de tu pedido{' '}
        <strong className="text-foreground">#{order.receiptNumber}</strong>.
      </p>
    );
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#25D366]/50 px-6 text-sm font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/10"
    >
      <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
      ¿No se abrió WhatsApp? Ábrelo aquí
    </a>
  );
}
