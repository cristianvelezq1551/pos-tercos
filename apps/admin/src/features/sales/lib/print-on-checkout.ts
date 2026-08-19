import { printReceipt, printReceiptData } from '../api/print';
import { logError } from '../../../lib/client-log';
import type { CheckoutSuccess } from '../components/CheckoutModal';

/**
 * Auto-imprime el recibo tras un cobro exitoso (sin botón ni ventana del
 * navegador). Best-effort: un fallo de impresora queda en el log, no rompe el
 * flujo (el banner de la venta conserva el botón "Imprimir recibo").
 */
export function printCheckoutReceipt(s: CheckoutSuccess): void {
  if (s.provisionalNumber && s.receipt) {
    // Offline: el recibo ya viene armado (número provisional OFF-N).
    void printReceiptData(s.receipt).catch((e) =>
      logError('print-receipt-offline', e, { provisionalNumber: s.provisionalNumber }),
    );
  } else if (s.saleId) {
    // Online: bytes del backend; si el backend cae, cae al recibo de la venta.
    void printReceipt(s.saleId, { fallback: s.sale }).catch((e) =>
      logError('print-receipt', e, { saleId: s.saleId }),
    );
  }
}
