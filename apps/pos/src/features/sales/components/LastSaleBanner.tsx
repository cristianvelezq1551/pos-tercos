'use client';

import { COP } from '../../catalog/lib/format';
import type { LastSaleSummary } from '../store/cart-store';

export function LastSaleBanner({
  sale,
  onDismiss,
}: {
  sale: LastSaleSummary;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
      <span className="mt-0.5">✓</span>
      <div className="flex-1">
        <p className="font-semibold">
          Venta #{sale.receiptNumber} pagada
        </p>
        <p className="mt-0.5">
          {COP.format(sale.total)} · {sale.paymentMethod}
          {sale.changeDue > 0 ? ` · cambio ${COP.format(sale.changeDue)}` : ''}
        </p>
        <p className="mt-1 text-[10px] text-emerald-700">
          Imprimir recibo + abrir cajón se cablea en 5.E.6.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Ocultar"
        className="ml-1 text-emerald-600 hover:text-emerald-800"
      >
        ✕
      </button>
    </div>
  );
}
