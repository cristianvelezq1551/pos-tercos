'use client';

import { Button, EmptyState, IconButton, Money, cn } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { Minus, Plus, X } from 'lucide-react';
import type { Promotion } from '@pos-tercos/types';
import { useEffect, useMemo, useState } from 'react';
import { fetchActivePromotions } from '../api';
import type { CartLine } from '../lib/cart-types';
import { computeCartTotals } from '../lib/totals';
import { useCartStore } from '../store/cart-store';
import { CheckoutModal, type CheckoutSuccess } from './CheckoutModal';
import { LastSaleBanner } from './LastSaleBanner';

const PROMO_REFRESH_MS = 60_000;

export function CartPanel() {
  const items = useCartStore((s) => s.items);
  const removeLine = useCartStore((s) => s.removeLine);
  const updateQty = useCartStore((s) => s.updateQty);
  const clear = useCartStore((s) => s.clear);
  const lastSale = useCartStore((s) => s.lastSale);
  const setLastSale = useCartStore((s) => s.setLastSale);

  const [promos, setPromos] = useState<Promotion[]>([]);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

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

  const handleCheckoutSuccess = (s: CheckoutSuccess) => {
    setLastSale({
      id: s.saleId,
      receiptNumber: s.receiptNumber,
      total: s.total,
      paymentMethod: s.paymentMethod,
      changeDue: s.changeDue,
    });
    clear();
    setCheckoutOpen(false);
  };

  return (
    <aside className="flex h-full flex-col border-l border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
          Carrito
          <span className="ml-2 text-xs font-medium text-muted-foreground">
            {items.length} ítem{items.length === 1 ? '' : 's'}
          </span>
        </h2>
        {items.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            Vaciar
          </Button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <EmptyState
              illustration={<LineArtIllustration name="empty-cart" />}
              title="Carrito vacío"
              description="Toca un producto del catálogo para empezar."
              size="sm"
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
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

      <footer className="border-t border-border bg-muted/40 px-4 py-3">
        {promoError ? (
          <p
            role="alert"
            className="mb-2 rounded-md border border-warning-border bg-warning-bg px-2 py-1 text-xs text-warning"
          >
            Promos: {promoError}
          </p>
        ) : null}
        <div className="space-y-1 text-sm">
          <Row label="Subtotal" value={totals.subtotal} />
          {totals.discount > 0 ? (
            <Row label="Descuentos" value={-totals.discount} highlight />
          ) : null}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <span className="font-display text-base font-bold text-foreground">Total</span>
            <Money amount={totals.total} size="2xl" weight="bold" />
          </div>
        </div>
        <Button
          size="xl"
          className="mt-3 w-full"
          disabled={items.length === 0}
          onClick={() => setCheckoutOpen(true)}
        >
          {items.length > 0 ? (
            <>
              Cobrar <Money amount={totals.total} size="lg" weight="bold" className="ml-2 text-current" />
            </>
          ) : (
            'Cobrar'
          )}
        </Button>
        {lastSale ? (
          <LastSaleBanner sale={lastSale} onDismiss={() => setLastSale(null)} />
        ) : null}
      </footer>

      <CheckoutModal
        open={checkoutOpen}
        total={totals.total}
        items={items}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={handleCheckoutSuccess}
      />
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
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={highlight ? 'text-success' : 'text-muted-foreground'}>{label}</span>
      <Money
        amount={value}
        weight={highlight ? 'semibold' : 'medium'}
        className={highlight ? 'text-success' : ''}
      />
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
  const description = [line.size?.name, ...line.modifiers.map((m) => m.name)]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{line.productName}</p>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            <Money amount={line.unitPrice} size="xs" weight="normal" className="text-current" /> c/u
          </p>
        </div>
        <IconButton
          aria-label="Quitar línea"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="-mr-1 text-ink-400 hover:text-destructive"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="inline-flex items-center rounded-lg border border-border">
          <button
            type="button"
            onClick={() => onQty(line.quantity - 1)}
            disabled={line.quantity <= 1}
            className="inline-flex h-8 w-8 items-center justify-center text-ink-600 transition-colors hover:bg-muted/40 disabled:opacity-30"
            aria-label="Restar uno"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <span className="w-8 text-center text-sm font-semibold tabular text-foreground">
            {line.quantity}
          </span>
          <button
            type="button"
            onClick={() => onQty(line.quantity + 1)}
            className="inline-flex h-8 w-8 items-center justify-center text-ink-600 transition-colors hover:bg-muted/40"
            aria-label="Sumar uno"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
        <div className="text-right">
          {hasPromo ? (
            <>
              <span className="mr-1.5 text-xs text-ink-400 line-through tabular">
                <Money amount={lineSubtotal} size="xs" weight="normal" className="text-current" />
              </span>
              <Money
                amount={lineTotal}
                weight="bold"
                className={cn('text-success')}
              />
              <span className="block text-[10px] font-medium text-success">
                −<Money amount={lineDiscount} size="xs" weight="normal" className="text-current" /> promo
              </span>
            </>
          ) : (
            <Money amount={lineSubtotal} weight="semibold" />
          )}
        </div>
      </div>
    </li>
  );
}
