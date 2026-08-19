/**
 * Armado de links `wa.me`. Compartido por la alerta de descuadre al dueño
 * (`build-link.ts`) y por el link de pedido del cliente (`order-link.ts`) — una
 * sola forma de normalizar el teléfono para las dos.
 */

import type { WhatsAppLinkResult } from './types';

/**
 * A los dígitos que espera wa.me. Acepta '+57 320 761 5261', '573207615261' o
 * los 10 dígitos locales (se les antepone el 57). null si no llega a 10
 * dígitos — con eso no se puede armar un link válido.
 */
export function normalizeWaPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

/** `messagePlain` se guarda sin encodear para poder leerlo en logs/auditoría. */
export function toWaLink(phone: string, messagePlain: string): WhatsAppLinkResult {
  return {
    url: `https://wa.me/${phone}?text=${encodeURIComponent(messagePlain)}`,
    messagePlain,
  };
}
