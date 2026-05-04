'use client';

import { Button } from '@pos-tercos/ui';
import { useEffect } from 'react';
import { COP } from '../../../lib/format';
import type { CartLine } from '../lib/cart-types';
import { cartSubtotal, useCartStore } from '../store/cart-store';

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
  const clear = useCartStore((s) => s.clear);

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

  if (!open) return null;

  const subtotal = cartSubtotal(items);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 id="cart-title" className="text-base font-semibold tracking-tight">
            Tu pedido{' '}
            <span className="ml-1 text-xs font-normal text-gray-500">({items.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            {items.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={clear}>
                Vaciar
              </Button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500">
              Tu carrito está vacío. Tocá un producto para empezar.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {items.map((line) => (
                <CartLineRow
                  key={line.lineId}
                  line={line}
                  onQty={(qty) => updateQty(line.lineId, qty)}
                  onRemove={() => removeLine(line.lineId)}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span className="text-lg font-bold tabular-nums">{COP.format(subtotal)}</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            El total final se calcula al finalizar el pedido (incluye promos).
          </p>
          <Button
            className="mt-3 h-12 w-full text-base"
            disabled={items.length === 0}
            onClick={onCheckout}
          >
            Continuar al checkout
          </Button>
        </footer>
      </aside>
    </div>
  );
}

function CartLineRow({
  line,
  onQty,
  onRemove,
}: {
  line: CartLine;
  onQty: (qty: number) => void;
  onRemove: () => void;
}) {
  const description = [line.size?.name, ...line.modifiers.map((m) => m.name)]
    .filter(Boolean)
    .join(' · ');
  const lineTotal = line.unitPrice * line.quantity;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{line.productName}</p>
          {description ? (
            <p className="mt-0.5 text-xs text-gray-500">{description}</p>
          ) : null}
          <p className="mt-1 text-xs text-gray-500">{COP.format(line.unitPrice)} c/u</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Quitar"
          className="ml-2 text-gray-300 hover:text-red-600"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="inline-flex items-center rounded-md border border-gray-200">
          <button
            type="button"
            onClick={() => onQty(line.quantity - 1)}
            disabled={line.quantity <= 1}
            className="px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30"
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-medium tabular-nums">
            {line.quantity}
          </span>
          <button
            type="button"
            onClick={() => onQty(line.quantity + 1)}
            className="px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            +
          </button>
        </div>
        <span className="text-sm font-semibold tabular-nums">{COP.format(lineTotal)}</span>
      </div>
    </li>
  );
}
