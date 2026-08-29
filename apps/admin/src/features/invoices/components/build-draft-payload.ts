import type { ConfirmInvoice, SaveInvoiceDraft } from '@pos-tercos/types';
import type { DraftRow } from './InvoiceItemRow';

/**
 * El payload de guardar borrador es el MISMO que el de confirmar, más lo que
 * hace falta para poder reanudarlo: la foto (si vino de la IA), sus avisos y
 * la conversión a unidad de inventario elegida en cada línea.
 *
 * El pago NO viaja: se declara al confirmar. Registrar plata contra una
 * factura que todavía puede borrarse dejaría un pago sin factura.
 */
export function buildDraftPayload(
  payload: ConfirmInvoice,
  rows: DraftRow[],
  opts: {
    iaContext?: { photoStorageKey: string; aiModelUsed: string };
    warnings: string[];
  },
): SaveInvoiceDraft {
  const { payment: _descartado, ...sinPago } = payload;
  return {
    ...sinPago,
    items: payload.items.map((item, idx) => {
      const factor = rows[idx]?.baseFactor;
      return factor != null && factor > 0 ? { ...item, baseFactor: factor } : item;
    }),
    ...(opts.iaContext
      ? {
          photoStorageKey: opts.iaContext.photoStorageKey,
          aiModelUsed: opts.iaContext.aiModelUsed,
        }
      : {}),
    ...(opts.warnings.length > 0 ? { warnings: opts.warnings } : {}),
  };
}
