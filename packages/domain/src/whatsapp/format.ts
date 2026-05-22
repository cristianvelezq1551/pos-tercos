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
