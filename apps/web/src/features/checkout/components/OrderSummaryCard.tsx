'use client';

import Link from 'next/link';
import { COP } from '../../../lib/format';
import type { CartLine } from '../../cart/lib/cart-types';

export function OrderSummaryCard({ items }: { items: readonly CartLine[] }) {
  if (items.length === 0) return null;
  const totalCount = items.reduce((acc, it) => acc + it.quantity, 0);

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-foreground">Tu pedido</h2>
        <Link
          href="/"
          className="text-sm font-medium text-primary transition-colors hover:text-red-500"
        >
          Editar
        </Link>
      </header>
      <p className="text-sm text-muted-foreground">
        {totalCount} {totalCount === 1 ? 'producto' : 'productos'} en tu pedido
      </p>

      <ul className="overflow-hidden rounded-xl border border-border bg-card">
        {items.map((line, idx) => (
          <OrderLineRow key={line.lineId} line={line} isLast={idx === items.length - 1} />
        ))}
      </ul>
    </section>
  );
}

function OrderLineRow({ line, isLast }: { line: CartLine; isLast: boolean }) {
  const meta = [line.size?.name, ...line.modifiers.map((m) => m.name)]
    .filter(Boolean)
    .join(' · ');
  const lineTotal = line.unitPrice * line.quantity;
  const initial = line.productName.trim().charAt(0).toUpperCase() || 'T';

  return (
    <li
      className={`flex items-center gap-3 px-4 py-4 ${
        isLast ? '' : 'border-b border-border'
      }`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-ink-800 to-ink-950">
        {line.imageUrl ? (
          <img
            src={line.imageUrl}
            alt={line.productName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="font-display text-2xl font-extrabold uppercase tracking-[0.04em] text-white/15">
            {initial}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm font-semibold text-foreground">
          {line.quantity} × {line.productName}
        </p>
        {meta ? (
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
        ) : null}
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
        {COP.format(lineTotal)}
      </span>
    </li>
  );
}
