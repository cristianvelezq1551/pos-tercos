'use client';

import { useState } from 'react';
import { facturaSharesPrinterWithComanda } from '../../printing/lib/printer-config';
import { PrintFacturaModal } from '../components/PrintFacturaModal';

export interface FacturaJob {
  receiptNumber: number | null;
  total: number;
  /** Acción real de impresión (cobro: printCheckoutReceipt; edición: printReceipt). */
  print: () => void;
}

/**
 * Decide cómo imprimir la factura, igual para cobro y edición: si la MISMA
 * impresora hace comanda + factura, abre el modal "Imprimir factura" (para que
 * el cajero corte la comanda primero y no salgan pegadas); si están en
 * impresoras distintas, imprime directo. Devuelve el disparador y el modal.
 */
export function useFacturaPrint() {
  const [pending, setPending] = useState<FacturaJob | null>(null);

  const requestFactura = (job: FacturaJob) => {
    if (facturaSharesPrinterWithComanda()) setPending(job);
    else job.print();
  };

  const facturaModal = (
    <PrintFacturaModal
      info={pending ? { receiptNumber: pending.receiptNumber, total: pending.total } : null}
      onPrint={() => {
        pending?.print();
        setPending(null);
      }}
      onClose={() => setPending(null)}
    />
  );

  return { requestFactura, facturaModal };
}
