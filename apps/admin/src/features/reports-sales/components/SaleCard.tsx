'use client';

import { saleTypeLabel, type Sale } from '@pos-tercos/types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { formatDate } from '../../../lib/format';
import { paymentSummary } from '../lib/payment-label';
import { SaleAmountCell } from './SaleAmountCell';
import { SaleExpandedDetail } from './SaleExpandedDetail';

/**
 * La misma venta, en celular.
 *
 * Una tabla de siete columnas no cabe en 390 px: se comprimía hasta pegar los
 * encabezados ("FECHATIPO"), partir la fecha en cinco renglones y dejar el
 * cajero cortado. Acá cada venta es una tarjeta con lo que se busca primero
 * —número, plata y hora— y el resto en una línea de contexto.
 */
export function SaleCard({ sale }: { sale: Sale }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 px-1 py-3 text-left transition-colors hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-medium tabular-nums text-foreground">#{sale.receiptNumber}</span>
            <SaleAmountCell sale={sale} />
          </span>
          {/* Dos líneas parejas: la hora y el tipo arriba, cómo pagó y quién
              cobró abajo. Todo en una sola truncaba el método, que es lo que se
              busca al cuadrar la caja. */}
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {formatDate(sale.paidAt ?? sale.createdAt, 'datetime')} · {saleTypeLabel(sale.type)}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {paymentSummary(sale)}
            {sale.customerName ? ` · ${sale.customerName}` : ''} ·{' '}
            {sale.cashierName ?? sale.paidByName ?? '—'}
          </span>
        </span>
      </button>
      {open ? (
        <div className="px-1 pb-3">
          <SaleExpandedDetail sale={sale} />
        </div>
      ) : null}
    </li>
  );
}
