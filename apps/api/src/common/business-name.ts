/**
 * Nombre del negocio para los textos que salen del sistema (WhatsApp, recibo).
 *
 * Existía repetido `process.env.BUSINESS_NAME ?? 'Tercos'` en 13 lugares: con
 * esa forma, el día que la var no esté cargada unos mensajes dicen el nombre
 * real y otros el fallback, sin que nadie lo note hasta verlo en un chat.
 */
export function businessName(): string {
  return process.env.BUSINESS_NAME?.trim() || 'Tercos';
}
