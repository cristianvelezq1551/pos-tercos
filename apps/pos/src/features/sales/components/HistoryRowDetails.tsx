'use client';

import type { Sale } from '@pos-tercos/types';
import { Money } from '@pos-tercos/ui';

/** Detalle expandible de un pedido en el historial (ítems + adiciones + notas). */
export function HistoryRowDetails({ sale }: { sale: Sale }) {
  const items = sale.items ?? [];
  return (
    <div className="mt-2 space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2">
      {sale.customerPhone ? (
        <p className="text-[0.6875rem] text-muted-foreground">Tel: {sale.customerPhone}</p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin ítems.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-foreground">
                  {it.quantity}× {it.productName ?? 'Producto'}
                  {it.sizeName ? ` · ${it.sizeName}` : ''}
                </span>
                <Money amount={it.lineTotal} className="shrink-0 text-xs" />
              </div>
              {it.modifiers.length > 0 ? (
                <p className="text-[0.625rem] text-muted-foreground">
                  + {it.modifiers.map((m) => m.name).join(', ')}
                </p>
              ) : null}
              {it.notes ? (
                <p className="text-[0.625rem] italic text-muted-foreground">“{it.notes}”</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {sale.discountTotal > 0 ? (
        <p className="border-t border-border pt-1 text-[0.6875rem] text-muted-foreground">
          Descuento: −{Math.round(sale.discountTotal).toLocaleString('es-CO')}
        </p>
      ) : null}
    </div>
  );
}
