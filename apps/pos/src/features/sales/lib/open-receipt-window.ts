/**
 * Imprime el recibo SIN cambiar de pestaña: inyecta el HTML en un
 * iframe oculto y dispara `print()` desde su contentWindow. El cajero
 * ve el dialog de impresión nativo del sistema y al cerrarlo sigue
 * en la pantalla del POS sin perder estado.
 *
 * Limitaciones para impresora térmica ESC/POS (Epson TM-T20III, Neotek,
 * etc.) conectada por USB: el HTML NO es el formato correcto. La térmica
 * espera bytes ESC/POS y CUPS le manda PostScript que vuelca como
 * garbage infinito. Para térmica usar el `print-agent` (FASE 15.C) con
 * PRINTER_PROVIDER=escpos en el backend.
 */
export function openReceiptWindow(html: string): boolean {
  // Reusamos un iframe persistente para no acumular nodos en el DOM
  // cuando el cajero imprime varios recibos seguidos.
  const IFRAME_ID = 'pos-receipt-print-frame';
  let iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
  }

  // srcdoc dispara `load` aunque el iframe ya exista.
  iframe.srcdoc = html;

  const handleLoad = () => {
    iframe?.removeEventListener('load', handleLoad);
    try {
      iframe?.contentWindow?.focus();
      iframe?.contentWindow?.print();
    } catch {
      // print() puede fallar si el browser está en modo headless o si
      // la pestaña perdió foco. El cajero puede usar Ctrl+P manual.
    }
  };
  iframe.addEventListener('load', handleLoad);
  return true;
}
