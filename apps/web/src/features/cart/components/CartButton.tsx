'use client';

import { useCartStore, cartLineCount, cartSubtotal } from '../store/cart-store';
import { COP } from '../../../lib/format';

export function CartButton({ onClick }: { onClick: () => void }) {
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const count = cartLineCount(items);
  const total = cartSubtotal(items);

  // Renderizar un placeholder estable hasta hidratar (evita SSR mismatch).
  if (!hydrated) {
    return (
      <button
        type="button"
        disabled
        aria-label="Cargando carrito"
        className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white opacity-70"
      >
        Carrito
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow hover:bg-blue-700"
    >
      <span>Carrito</span>
      {count > 0 ? (
        <>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-blue-700">
            {count}
          </span>
          <span className="hidden tabular-nums sm:inline">{COP.format(total)}</span>
        </>
      ) : null}
    </button>
  );
}
