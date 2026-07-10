'use client';

import { ArrowLeft, ShoppingBag, Minus, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { COP } from '../../../lib/format';
import { computeCartPromoTotals, usePromotions } from '../../promotions';
import type { CartLine } from '../lib/cart-types';
import { cartLineCount, useCartStore } from '../store/cart-store';

export function CartDrawer({
  open,
  onClose,
  onCheckout,
}: {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
}) {
  const items = useCartStore((s) => s.items);
  const removeLine = useCartStore((s) => s.removeLine);
  const updateQty = useCartStore((s) => s.updateQty);
  const promotions = usePromotions((s) => s.promotions);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // Preview con promos del canal web (el backend recalcula al crear el pedido).
  const totals = computeCartPromoTotals(items, promotions);
  const totalCount = cartLineCount(items);
  const empty = items.length === 0;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm motion-safe:animate-[fadeIn_120ms_ease-out_forwards]"
        onClick={onClose}
        role="presentation"
        aria-hidden
      />
      <aside
        className="fixed inset-0 z-50 flex flex-col bg-card will-change-transform motion-safe:animate-[slideIn_220ms_cubic-bezier(0.22,1,0.36,1)_forwards] sm:left-auto sm:right-0 sm:max-w-md sm:shadow-[-12px_0_32px_rgba(0,0,0,0.4)]"
        style={{ height: '100dvh' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6 sm:py-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex items-center gap-2 text-foreground sm:hidden"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2} />
            <h2 id="cart-title-mobile" className="text-xl font-extrabold tracking-tight">
              Tu carrito
            </h2>
          </button>
          <h2
            id="cart-title"
            className="hidden text-xl font-extrabold tracking-tight text-foreground sm:block"
          >
            Tu carrito
          </h2>
          <div className="flex items-center gap-3">
            {totalCount > 0 ? (
              <span className="inline-flex h-6 items-center rounded-full bg-primary px-2.5 text-[11px] font-bold text-primary-foreground sm:hidden">
                {totalCount} {totalCount === 1 ? 'producto' : 'productos'}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="hidden h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground transition-colors hover:bg-ink-700 sm:inline-flex"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <ShoppingBag className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-muted-foreground">
                Tu carrito está vacío. Toca un producto para empezar.
              </p>
            </div>
          ) : (
            <ul>
              {items.map((line, idx) => (
                <CartLineRow
                  key={line.lineId}
                  line={line}
                  lineDiscount={totals.lineDiscounts[idx] ?? 0}
                  onDecrement={() => {
                    if (line.quantity <= 1) removeLine(line.lineId);
                    else updateQty(line.lineId, line.quantity - 1);
                  }}
                  onIncrement={() => updateQty(line.lineId, line.quantity + 1)}
                  onRemove={() => removeLine(line.lineId)}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="flex flex-col gap-4 border-t border-border px-5 py-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:px-6 sm:pb-6">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Subtotal ({totalCount} {totalCount === 1 ? 'producto' : 'productos'})
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {COP.format(totals.subtotal)}
              </span>
            </div>
            {totals.discount > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-500">Descuento promos</span>
                <span className="font-semibold tabular-nums text-emerald-500">
                  −{COP.format(totals.discount)}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-foreground">Total estimado</span>
              <span className="text-2xl font-extrabold tabular-nums text-foreground">
                {COP.format(totals.total)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onCheckout}
            disabled={empty}
            className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-md transition-colors hover:bg-red-700 hover:shadow-primary/30 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ShoppingBag className="h-5 w-5" strokeWidth={2} />
            Ir a pagar
          </button>
        </footer>
      </aside>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </>,
    document.body,
  );
}

function CartLineRow({
  line,
  lineDiscount,
  onDecrement,
  onIncrement,
  onRemove,
}: {
  line: CartLine;
  lineDiscount: number;
  onDecrement: () => void;
  onIncrement: () => void;
  onRemove: () => void;
}) {
  const description = [line.size?.name, ...line.modifiers.map((m) => m.name)]
    .filter(Boolean)
    .join(' · ');
  const lineTotal = line.unitPrice * line.quantity;
  const initial = line.productName.trim().charAt(0).toUpperCase() || 'T';
  const willRemove = line.quantity <= 1;

  return (
    <li className="flex gap-3 border-b border-border px-5 py-4 sm:px-6">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-muted to-background">
        {line.imageUrl ? (
          <img
            src={line.imageUrl}
            alt={line.productName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="font-display text-3xl font-extrabold uppercase tracking-[0.04em] text-white/15">
            {initial}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {line.productName}
          </p>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Quitar línea"
            className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
        {description ? (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        ) : null}
        {line.notes ? (
          <p className="text-xs italic text-muted-foreground">“{line.notes}”</p>
        ) : null}

        <div className="mt-1 flex items-center justify-between gap-3">
          {lineDiscount > 0 ? (
            <span className="flex items-baseline gap-1.5">
              <span className="text-xs tabular-nums text-muted-foreground line-through">
                {COP.format(lineTotal)}
              </span>
              <span className="text-sm font-bold tabular-nums text-emerald-500">
                {COP.format(lineTotal - lineDiscount)}
              </span>
            </span>
          ) : (
            <span className="text-sm font-bold tabular-nums text-foreground">
              {COP.format(lineTotal)}
            </span>
          )}
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={onDecrement}
              aria-label={willRemove ? 'Quitar línea' : 'Quitar uno'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
            >
              {willRemove ? (
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              ) : (
                <Minus className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </button>
            <span className="w-6 text-center text-sm font-semibold tabular-nums text-foreground">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={onIncrement}
              aria-label="Sumar uno"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-red-700"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
