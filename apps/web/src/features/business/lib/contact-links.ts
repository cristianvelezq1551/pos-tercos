import type { BusinessContact } from '@pos-tercos/types';

/**
 * Deep links derivados del teléfono/ubicación que configura el dueño.
 * Reemplazan a `lib/business.ts`, que tenía todo esto hardcodeado.
 */

const WHATSAPP_TEXT = 'Hola TERCOS! Quiero hacer un pedido.';

/** `tel:` — null si no hay número cargado (los botones no se muestran). */
export function telUrl(contact: BusinessContact): string | null {
  return contact.phone ? `tel:${contact.phone}` : null;
}

/** wa.me exige el número sin "+" ni separadores. */
export function whatsappUrl(contact: BusinessContact): string | null {
  if (!contact.phone) return null;
  return `https://wa.me/${contact.phone.replace(/\D/g, '')}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;
}

/** Ficha del local. Si no hay link, cae a buscar la dirección en Maps. */
export function mapsUrl(contact: BusinessContact): string | null {
  if (contact.mapsUrl) return contact.mapsUrl;
  if (contact.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`;
  }
  return null;
}

/** Navegación directa. Sin coordenadas cae a la dirección en texto. */
export function googleDirectionsUrl(contact: BusinessContact): string | null {
  const destination = contact.coords || contact.address;
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** Waze necesita coordenadas sí o sí — sin ellas, no se ofrece la opción. */
export function wazeUrl(contact: BusinessContact): string | null {
  if (!contact.coords) return null;
  return `https://waze.com/ul?ll=${encodeURIComponent(contact.coords)}&navigate=yes`;
}

/** Mapa embebido de Google. Sin API key: el modo `q=` público alcanza para un pin. */
export function mapEmbedUrl(contact: BusinessContact): string | null {
  const q = contact.coords || contact.address;
  if (!q) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=17&output=embed`;
}
