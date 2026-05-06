'use client';

import { Money } from '@pos-tercos/ui';
import { ShoppingBag } from 'lucide-react';
import { useCartStore, cartLineCount, cartSubtotal } from '../store/cart-store';

export function CartButton({ onClick }: { onClick: () => void }) {
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const count = cartLineCount(items);
  const total = cartSubtotal(items);

  if (!hydrated) {
    return (
      <button
        type="button"
        disabled
        aria-label="Cargando carrito"
        className="inline-flex h-10 items-center gap-2 rounded-full bg-primary/40 px-5 text-sm font-semibold text-primary-foreground opacity-70"
      >
        <ShoppingBag className="h-4 w-4" strokeWidth={1.75} />
        Pedir
      </button>
    );
  }

  if (count === 0) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="press inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-red-700 hover:shadow-primary/30 active:bg-red-800"
      >
        <ShoppingBag className="h-4 w-4" strokeWidth={1.75} />
        Pedir
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="press inline-flex items-center gap-3 rounded-full bg-card px-2 py-1.5 pr-1.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
    >
      <Money amount={total} size="sm" weight="bold" className="pl-2 text-foreground tabular-nums" />
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">
        <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.75} />
        {count} {count === 1 ? 'ítem' : 'ítems'}
      </span>
    </button>
  );
}
