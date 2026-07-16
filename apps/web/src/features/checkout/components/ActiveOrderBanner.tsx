'use client';

import { ChevronRight, Receipt } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActiveOrder } from '../store/active-order-store';

export function ActiveOrderBanner() {
  const pathname = usePathname();
  const order = useActiveOrder((s) => s.order);
  const hydrated = useActiveOrder((s) => s.hydrated);

  if (!hydrated || !order) return null;
  if (pathname?.startsWith('/checkout')) return null;

  const href = `/checkout/success/${order.saleId}?token=${encodeURIComponent(order.token)}`;
  return (
    <div className="sticky top-16 z-20 border-b border-primary/30 bg-primary/[0.08] px-4 backdrop-blur-md sm:px-12 lg:px-20">
      <Link
        href={href}
        className="press flex items-center justify-between gap-3 py-3 text-foreground"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Receipt className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-bold">
            Tu pedido #{order.receiptNumber} en curso
          </span>
          <span className="truncate text-xs text-muted-foreground">
            Toca para ver el estado de tu pedido
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.25} />
      </Link>
    </div>
  );
}
