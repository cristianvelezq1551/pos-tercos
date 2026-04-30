/**
 * Abre el HTML del recibo en una pestaña nueva como Blob URL y lanza
 * window.print() automáticamente. Si el browser bloquea el popup, retorna
 * false para que el caller muestre un fallback.
 *
 * Debe llamarse desde un handler de evento del usuario (click), si no
 * el popup blocker la rechaza.
 */
export function openReceiptWindow(html: string): boolean {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  // El recibo HTML lleva @media print embebido. Disparamos print() cuando carga.
  win.addEventListener('load', () => {
    try {
      win.focus();
      win.print();
    } catch {
      // print falla en algunos browsers; el usuario puede usar Ctrl+P
    }
  });
  // Liberamos el blob cuando la pestaña se cierra (mejor effort).
  win.addEventListener('beforeunload', () => URL.revokeObjectURL(url));
  return true;
}
