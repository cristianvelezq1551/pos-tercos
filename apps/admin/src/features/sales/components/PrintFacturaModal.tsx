'use client';

import { Button, Dialog, formatCop } from '@pos-tercos/ui';

/**
 * Paso aparte para imprimir la factura cuando la MISMA impresora imprime comanda
 * + factura. La comanda ya salió (al confirmar el pago o al editar); este modal
 * deja que el cajero corte la comanda y recién ahí imprima la factura, para que
 * no salgan pegadas en el mismo rollo. Si cada documento va a su impresora, este
 * modal no aparece (todo automático).
 */
export function PrintFacturaModal({
  info,
  onPrint,
  onClose,
}: {
  info: { receiptNumber: number | null; total: number } | null;
  onPrint: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={info !== null}
      onClose={onClose}
      title="Imprimir factura"
      description={
        info ? `Recibo #${info.receiptNumber ?? '-'} · ${formatCop(info.total)}` : undefined
      }
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            No imprimir
          </Button>
          <Button size="lg" onClick={onPrint}>
            Imprimir factura
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground">
        La comanda ya se imprimió. Cortala y, cuando estés listo, imprimí la
        factura del cliente.
      </p>
    </Dialog>
  );
}
