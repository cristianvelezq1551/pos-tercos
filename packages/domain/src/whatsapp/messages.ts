/**
 * Builders puros del TEXTO de los mensajes WhatsApp al cliente. El envío
 * lo hace un WhatsAppProvider (apps/api). Sin IO, tree-shakable.
 */

import { formatCop, greet } from './format';
import type {
  WhatsAppMessageOptions,
  WhatsAppNotificationStage,
  WhatsAppSaleSnapshot,
} from './types';

/**
 * Cajero aceptó el pedido → pedimos pago + comprobante.
 *
 * En domicilio esto sale recién cuando el cajero asigna el envío: el total ya
 * lo incluye (el cliente transfiere UN solo monto). Antes de eso el número no
 * sería real.
 */
export function buildPaymentInstructionsMessage(
  sale: WhatsAppSaleSnapshot,
  opts: WhatsAppMessageOptions,
): string {
  const instr = opts.paymentInstructions?.trim()
    ? `\n\n${opts.paymentInstructions.trim()}`
    : '';
  const delivery = sale.deliveryAddress?.trim()
    ? `\n\nEse total ya incluye el domicilio.`
    : '';
  return (
    `${greet(sale.customerName)}, recibimos tu pedido #${sale.receiptNumber} en ${opts.businessName}. ` +
    `Total: ${formatCop(sale.total)}.${instr}${delivery}\n\n` +
    `Cuando pagues, enviános el comprobante por este chat para confirmarlo. ¡Gracias!`
  );
}

/** Cajero verificó el pago → pasa a cocina. */
export function buildPaymentReceivedMessage(
  sale: WhatsAppSaleSnapshot,
  opts: WhatsAppMessageOptions,
): string {
  return (
    `${greet(sale.customerName)}, tu pago del pedido #${sale.receiptNumber} fue confirmado ✅. ` +
    `Ya pasó a cocina y te avisamos cuando esté listo. — ${opts.businessName}`
  );
}

/**
 * El pedido está listo. Un domicilio NO se retira: va en camino, así que el
 * texto se bifurca por la dirección de entrega. La dirección se repite en el
 * mensaje para que el cliente pueda corregirla antes de que salga.
 */
export function buildPickupReadyMessage(
  sale: WhatsAppSaleSnapshot,
  opts: WhatsAppMessageOptions,
): string {
  const deliveryAddress = sale.deliveryAddress?.trim();
  if (deliveryAddress) {
    return (
      `${greet(sale.customerName)}, tu pedido #${sale.receiptNumber} va en camino 🛵 ` +
      `Lo llevamos a: ${deliveryAddress}. — ${opts.businessName}`
    );
  }
  const addr = opts.businessAddressShort?.trim()
    ? ` Te esperamos en ${opts.businessAddressShort.trim()}.`
    : '';
  return (
    `${greet(sale.customerName)}, tu pedido #${sale.receiptNumber} ya está listo para retirar.${addr} — ${opts.businessName}`
  );
}

/** Cajero rechazó/canceló el pedido (nunca se pagó). */
export function buildCanceledMessage(
  sale: WhatsAppSaleSnapshot,
  opts: WhatsAppMessageOptions,
): string {
  return (
    `${greet(sale.customerName)}, lamentablemente tu pedido #${sale.receiptNumber} fue cancelado. ` +
    `Si creés que es un error o querés volver a pedir, escribinos por este chat. — ${opts.businessName}`
  );
}

/** Dispatcher por stage para call-sites que ya conocen la etapa. */
export function buildNotificationMessage(
  stage: WhatsAppNotificationStage,
  sale: WhatsAppSaleSnapshot,
  opts: WhatsAppMessageOptions,
): string {
  switch (stage) {
    case 'payment_instructions':
      return buildPaymentInstructionsMessage(sale, opts);
    case 'payment_received':
      return buildPaymentReceivedMessage(sale, opts);
    case 'pickup_ready':
      return buildPickupReadyMessage(sale, opts);
    case 'canceled':
      return buildCanceledMessage(sale, opts);
  }
}
