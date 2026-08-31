/** Helpers de formato puros compartidos por los builders de WhatsApp. */

export function greet(name: string | null): string {
  const trimmed = (name ?? '').trim();
  if (trimmed.length === 0) return 'Hola';
  // Solo el primer nombre — más natural en WhatsApp.
  const first = trimmed.split(/\s+/)[0];
  return `Hola ${first}`;
}

/** Formato COP minimalista sin Intl (mantiene el domain tree-shakable). */
export function formatCop(amount: number): string {
  const rounded = Math.round(amount);
  const withDots = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${withDots}`;
}

/**
 * Cantidad de inventario legible: miles con punto y hasta 2 decimales, sin
 * ceros de relleno. 2500 → "2.500"; 2.5 → "2,5". Coma decimal como en el resto
 * de la app (es-CO).
 */
export function formatQty(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [entero, decimales] = Math.abs(rounded).toFixed(2).split('.');
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = decimales.replace(/0+$/, '');
  const signo = rounded < 0 ? '-' : '';
  return dec.length > 0 ? `${signo}${conPuntos},${dec}` : `${signo}${conPuntos}`;
}
