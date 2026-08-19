'use client';

import { Button, Money } from '@pos-tercos/ui';
import type { CartTotalsResult } from '../lib/totals';
import type { LastSaleSummary } from '../store/cart-store';
import { LastSaleBanner } from './LastSaleBanner';

/** Pie del carrito: subtotal/descuentos/total + botón Cobrar + banner de la última venta. */
export function CartFooter({
  totals,
  itemsCount,
  promoError,
  lastSale,
  onCheckout,
  onDismissLastSale,
}: {
  totals: CartTotalsResult;
  itemsCount: number;
  promoError: string | null;
  lastSale: LastSaleSummary | null;
  onCheckout: () => void;
  onDismissLastSale: () => void;
}) {
  return (
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
        {totals.discount > 0 ? <Row label="Descuentos" value={-totals.discount} highlight /> : null}
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <span className="font-display text-base font-bold text-foreground">Total</span>
          <Money amount={totals.total} size="2xl" weight="bold" />
        </div>
      </div>
      <Button size="xl" className="mt-3 w-full" disabled={itemsCount === 0} onClick={onCheckout}>
        {itemsCount > 0 ? (
          <>
            Cobrar{' '}
            <Money amount={totals.total} size="lg" weight="bold" className="ml-2 text-current" />
          </>
        ) : (
          'Cobrar'
        )}
      </Button>
      {lastSale ? <LastSaleBanner sale={lastSale} onDismiss={onDismissLastSale} /> : null}
    </footer>
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
