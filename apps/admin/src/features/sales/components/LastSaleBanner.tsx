'use client';

import { IconButton, Money } from '@pos-tercos/ui';
import { Check, X } from 'lucide-react';
import type { LastSaleSummary } from '../store/cart-store';

/**
 * Confirmación de la última venta. El recibo se imprime solo al cobrar y el
 * cajón se abre con esa impresión (efectivo). La reimpresión vive en el
 * Historial del día. Aquí solo se muestra el resumen.
 */
export function LastSaleBanner({
  sale,
  onDismiss,
}: {
  sale: LastSaleSummary;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-success-border bg-success-bg px-3 py-2.5 text-xs text-success">
      <div className="flex items-start gap-2">
        <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        <div className="flex-1 leading-tight">
          <p className="text-sm font-semibold text-foreground">
            {sale.provisionalNumber ? (
              <>{sale.provisionalNumber} · cobrada offline</>
            ) : sale.receiptNumber !== null ? (
              <>Recibo #{sale.receiptNumber} · pagado</>
            ) : (
              <>Venta pagada</>
            )}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {sale.provisionalNumber ? 'Pendiente de sincronizar' : `Recibo #${sale.receiptNumber}`} ·{' '}
            <Money amount={sale.total} size="xs" weight="medium" className="text-current" /> ·{' '}
            {sale.paymentMethod}
            {sale.changeDue > 0 ? (
              <>
                {' '}
                · cambio{' '}
                <Money amount={sale.changeDue} size="xs" weight="medium" className="text-current" />
              </>
            ) : null}
          </p>
        </div>
        <IconButton
          aria-label="Ocultar"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="-mr-1 -mt-1 text-success hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
