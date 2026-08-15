'use client';

import type { CortesiaRequest, Sale } from '@pos-tercos/types';
import { Money, StatusBadge } from '@pos-tercos/ui';
import type { DayEntry } from '../lib/day-entries';
import { SALE_STATUS_MAPPING } from '../lib/sale-status-mapping';

/**
 * Últimos pedidos del día en el panel de venta. Incluye las CORTESÍAS: un
 * pedido regalado salió de la cocina igual que uno cobrado — si no aparece acá,
 * el cajero no tiene el día completo a la vista. Va rotulado y con el valor
 * tachado para que se lea como lo que es: plata que no entró.
 */
export function RecentOrdersSection({
  entries,
  onSelectSale,
  onSelectCortesia,
}: {
  entries: readonly DayEntry[];
  onSelectSale: (sale: Sale) => void;
  onSelectCortesia: (cortesia: CortesiaRequest) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Últimos pedidos
      </h3>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Todavía no hay pedidos hoy.</p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((e) =>
            e.kind === 'cortesia' ? (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelectCortesia(e.cortesia)}
                  className="flex w-full items-center justify-between gap-2 py-1.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {e.cortesia.quantity}× {e.cortesia.productName ?? 'Producto'}
                    </p>
                    <span className="mt-0.5 inline-flex items-center rounded-full border border-warning-border bg-warning-bg px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-warning">
                      Cortesía
                    </span>
                  </div>
                  <Money
                    amount={e.cortesia.salePrice}
                    size="sm"
                    weight="medium"
                    className="line-through text-muted-foreground"
                  />
                </button>
              </li>
            ) : (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelectSale(e.sale)}
                  className="flex w-full items-center justify-between gap-2 py-1.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      #{e.sale.receiptNumber}
                      {e.sale.customerName ? ` · ${e.sale.customerName}` : ''}
                    </p>
                    <StatusBadge status={e.sale.status} mapping={SALE_STATUS_MAPPING} size="sm" />
                  </div>
                  <Money amount={e.sale.total} size="sm" weight="medium" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
