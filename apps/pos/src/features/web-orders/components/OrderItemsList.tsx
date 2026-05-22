'use client';

import type { Sale } from '@pos-tercos/types';
import { LoadingSkeleton, Money } from '@pos-tercos/ui';

export function OrderItemsList({
  loading,
  sale,
}: {
  loading: boolean;
  sale: Sale | null;
}) {
  if (loading) {
    return <LoadingSkeleton shape="text" count={4} />;
  }
  if (!sale || !sale.items) {
    return null;
  }
  return (
    <section className="rounded-xl border border-border p-3 text-sm">
      <p className="caps text-[0.625rem] text-muted-foreground">Ítems</p>
      <ul className="mt-2 space-y-1">
        {sale.items.map((it) => (
          <li key={it.id} className="flex justify-between gap-2">
            <span>
              <span className="font-mono font-bold">×{it.quantity}</span>{' '}
              <span className="font-medium">{it.productName ?? 'producto'}</span>
              {it.sizeName ? (
                <span className="text-muted-foreground"> · {it.sizeName}</span>
              ) : null}
            </span>
            <Money amount={it.lineTotal} size="sm" weight="medium" />
          </li>
        ))}
      </ul>
    </section>
  );
}
