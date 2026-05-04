/**
 * Builders puros de URLs wa.me para los 3 stages de la venta web.
 *
 * - `accepted`: cajero acepta + pide comprobante (única vía de pago).
 * - `confirmed`: pago verificado, va a cocina.
 * - `ready`: cocinero marcó listo. Pickup ≠ delivery copy.
 *
 * Diseño:
 * - Sin parámetros mágicos. Toda la data llega via `WhatsAppSaleSnapshot`.
 * - Format COP simple (no Intl en domain — keep it pure y tree-shakable).
 * - Phone normalizado a dígitos para `wa.me/` (acepta +57, espacios, dashes).
 * - Devuelve `null` si no hay phone — caller decide qué hacer (UI puede
 *   ocultar el botón o mostrar disabled).
 */

import type {
  WhatsAppBuildOptions,
  WhatsAppLinkResult,
  WhatsAppSaleSnapshot,
} from './types';

export function buildAcceptedLink(
  sale: WhatsAppSaleSnapshot,
  opts: WhatsAppBuildOptions,
): WhatsAppLinkResult | null {
  const phone = normalizePhone(sale.customerPhone);
  if (!phone) return null;

  const greeting = greet(sale.customerName);
  const messagePlain =
    `${greeting}, recibimos tu pedido #${sale.receiptNumber} en ${opts.businessName}. ` +
    `Total: ${formatCop(sale.total)}. ` +
    `Para confirmarlo necesitamos tu comprobante de pago (Nequi / transferencia) por este chat. ¡Gracias!`;
  return toLink(phone, messagePlain);
}

export function buildConfirmedLink(
  sale: WhatsAppSaleSnapshot,
  opts: WhatsAppBuildOptions,
): WhatsAppLinkResult | null {
  const phone = normalizePhone(sale.customerPhone);
  if (!phone) return null;

  const greeting = greet(sale.customerName);
  const messagePlain =
    `${greeting}, tu pago del pedido #${sale.receiptNumber} fue confirmado ✅. ` +
    `Ya pasó a cocina y te avisamos cuando esté listo. — ${opts.businessName}`;
  return toLink(phone, messagePlain);
}

export function buildReadyLink(
  sale: WhatsAppSaleSnapshot,
  opts: WhatsAppBuildOptions,
): WhatsAppLinkResult | null {
  const phone = normalizePhone(sale.customerPhone);
  if (!phone) return null;

  const greeting = greet(sale.customerName);
  let messagePlain: string;
  if (sale.type === 'WEB_PICKUP') {
    const addr = opts.businessAddressShort
      ? ` Te esperamos en ${opts.businessAddressShort}.`
      : '';
    messagePlain = `${greeting}, tu pedido #${sale.receiptNumber} ya está listo para retirar.${addr} — ${opts.businessName}`;
  } else {
    // WEB_DELIVERY
    messagePlain = `${greeting}, tu pedido #${sale.receiptNumber} salió a entrega. Llega en ~20 min. — ${opts.businessName}`;
  }
  return toLink(phone, messagePlain);
}

/**
 * Dispatcher general por stage. Útil para call-sites que ya conocen el
 * stage (controller, service) sin tener que importar 3 builders.
 */
export function buildLinkForStage(
  stage: 'accepted' | 'confirmed' | 'ready',
  sale: WhatsAppSaleSnapshot,
  opts: WhatsAppBuildOptions,
): WhatsAppLinkResult | null {
  switch (stage) {
    case 'accepted':
      return buildAcceptedLink(sale, opts);
    case 'confirmed':
      return buildConfirmedLink(sale, opts);
    case 'ready':
      return buildReadyLink(sale, opts);
  }
}

// ====================================================================
// HELPERS (puros)
// ====================================================================

function greet(name: string | null): string {
  const trimmed = (name ?? '').trim();
  if (trimmed.length === 0) return 'Hola';
  // Solo el primer nombre — más natural en WhatsApp.
  const first = trimmed.split(/\s+/)[0];
  return `Hola ${first}`;
}

/**
 * Phone E.164 → solo dígitos para wa.me/.
 * Acepta `+573001234567`, `573001234567`, `300 123 4567`. Devuelve `573001234567`.
 * Devuelve null si no quedan ≥10 dígitos.
 *
 * Nota: wa.me requiere el país en el prefijo. Si el phone llega sin +57,
 * asumimos que ya viene normalizado del input (el web checkout fuerza
 * +57 + 10 dígitos, el POS usa el mismo formato).
 */
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, '');
  if (digits.length < 10) return null;
  // Si vienen 10 dígitos (sin país), prepend 57.
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

function toLink(phone: string, messagePlain: string): WhatsAppLinkResult {
  const encoded = encodeURIComponent(messagePlain);
  return {
    url: `https://wa.me/${phone}?text=${encoded}`,
    messagePlain,
  };
}

/** Formato COP minimalista. Sin Intl (mantiene domain tree-shakable). */
function formatCop(amount: number): string {
  const rounded = Math.round(amount);
  // 12345 → "12.345"
  const withDots = rounded
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${withDots}`;
}
