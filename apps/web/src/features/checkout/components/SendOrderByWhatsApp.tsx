'use client';

import { buildWebOrderLink } from '@pos-tercos/domain';
import type { PublicWebOrder } from '@pos-tercos/types';
import { MessageCircle } from 'lucide-react';
import { useBusiness } from '../../business';

/**
 * Abre el WhatsApp del cliente con SU pedido ya escrito.
 *
 * El pedido ya existe (se creó en la web con precios, promos, stock, horario y
 * zona validados): el chat solo lo referencia por su `#N`. Que el cliente
 * escriba primero abre la ventana de 24 h, donde contestarle es texto libre y
 * gratis — sin templates de Meta.
 *
 * NO envía nada: deja el mensaje escrito y el cliente toca enviar. Si no lo
 * toca no se pierde nada: los datos de pago están acá abajo en esta misma
 * pantalla. Por eso el botón vive JUNTO a las instrucciones y no en vez de ellas.
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
  });

  // Sin teléfono configurado no hay a dónde escribir.
  if (!link) return null;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 text-base font-bold text-black shadow-md transition-colors hover:bg-[#1FBE59] active:bg-[#17A94D]"
    >
      <MessageCircle className="h-5 w-5" strokeWidth={2.25} />
      Enviar mi pedido por WhatsApp
    </a>
  );
}
