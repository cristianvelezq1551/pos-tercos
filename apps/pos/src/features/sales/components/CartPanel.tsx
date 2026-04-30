'use client';

import { Button } from '@pos-tercos/ui';
import type { Promotion } from '@pos-tercos/types';
import { useEffect, useMemo, useState } from 'react';
import { COP } from '../../catalog/lib/format';
import { fetchActivePromotions } from '../api';
import type { CartLine } from '../lib/cart-types';
import { computeCartTotals } from '../lib/totals';
import { useCartStore } from '../store/cart-store';

const PROMO_REFRESH_MS = 60_000;

export function CartPanel() {
  const items = useCartStore((s) => s.items);
  const removeLine = useCartStore((s) => s.removeLine);
  const updateQty = useCartStore((s) => s.updateQty);
  const clear = useCartStore((s) => s.clear);

  const [promos, setPromos] = useState<Promotion[]>([]);
  const [promoError, setPromoError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchActivePromotions();
        if (!cancelled) {
          setPromos(data);
          setPromoError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setPromoError(err instanceof Error ? err.message : 'Error cargando promos');
        }
      }
    };
    load();
    const id = setInterval(load, PROMO_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const totals = useMemo(() => computeCartTotals(items, promos), [items, promos]);

  return (
    <aside className="flex h-full flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Carrito{' '}
          <span className="ml-1 text-xs font-normal text-gray-500">({items.length})</span>
        </h2>
        {items.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            Vaciar
          </Button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-xs text-gray-400">
            Tocá un producto del catálogo para empezar.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((line) => {
              const totalLine = totals.lines.find((l) => l.lineId === line.lineId);
              return (
                <CartLineRow
                  key={line.lineId}
                  line={line}
                  lineSubtotal={totalLine?.lineSubtotal ?? 0}
                  lineDiscount={totalLine?.lineDiscount ?? 0}
                  lineTotal={totalLine?.lineTotal ?? 0}
                  hasPromo={!!totalLine?.appliedPromotionId}
                  onQty={(qty) => updateQty(line.lineId, qty)}
                  onRemove={() => removeLine(line.lineId)}
                />
              );
            })}
          </ul>
        )}
      </div>

      <footer className="border-t border-gray-200 bg-gray-50 px-4 py-3">
        {promoError ? (
          <p className="mb-2 text-xs text-amber-700">⚠ Promos: {promoError}</p>
        ) : null}
        <div className="space-y-1 text-sm">
          <Row label="Subtotal" value={totals.subtotal} />
          {totals.discount > 0 ? (
            <Row label="Descuentos" value={-totals.discount} muted={false} highlight />
          ) : null}
          <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
            <span className="text-sm font-medium">Total</span>
            <span className="text-lg font-bold tabular-nums">
              {COP.format(totals.total)}
            </span>
          </div>
        </div>
        <Button className="mt-3 w-full" disabled={items.length === 0}>
          Cobrar {items.length > 0 ? COP.format(totals.total) : ''}
        </Button>
        <p className="mt-2 text-center text-[10px] text-gray-400">
          Cobro real entra en 5.E.5 (CASH/digital + doble validación).
        </p>
      </footer>
    </aside>
  );
}

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={highlight ? 'text-emerald-700' : 'text-gray-600'}>{label}</span>
      <span
        className={`tabular-nums ${highlight ? 'text-emerald-700 font-medium' : 'text-gray-900'}`}
      >
        {COP.format(value)}
      </span>
    </div>
  );
}

function CartLineRow({
  line,
  lineSubtotal,
  lineDiscount,
  lineTotal,
  hasPromo,
  onQty,
  onRemove,
}: {
  line: CartLine;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
  hasPromo: boolean;
  onQty: (qty: number) => void;
  onRemove: () => void;
}) {
  const description = [
    line.size?.name,
    ...line.modifiers.map((m) => m.name),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{line.productName}</p>
          {description ? (
            <p className="mt-0.5 text-xs text-gray-500">{description}</p>
          ) : null}
          <p className="mt-1 text-xs text-gray-500">
            {COP.format(line.unitPrice)} c/u
          </p>
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
        <div className="text-right">
          {hasPromo ? (
            <>
              <span className="mr-1 text-xs text-gray-400 line-through tabular-nums">
                {COP.format(lineSubtotal)}
              </span>
              <span className="text-sm font-semibold tabular-nums text-emerald-700">
                {COP.format(lineTotal)}
              </span>
              <span className="block text-[10px] text-emerald-600">
                −{COP.format(lineDiscount)} promo
              </span>
            </>
          ) : (
            <span className="text-sm font-semibold tabular-nums">
              {COP.format(lineSubtotal)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
