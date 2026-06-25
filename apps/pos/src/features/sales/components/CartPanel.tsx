'use client';

import { Button, EmptyState, Money } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import type { Promotion } from '@pos-tercos/types';
import { useMemo, useState } from 'react';
import { fetchActivePromotions } from '../api';
import { printReceipt, printReceiptData } from '../api/print';
import { computeCartTotals } from '../lib/totals';
import { useCartStore } from '../store/cart-store';
import { CartLineRow } from './CartLineRow';
import { CheckoutModal, type CheckoutSuccess } from './CheckoutModal';
import { LastSaleBanner } from './LastSaleBanner';
import { CortesiaModal, LineCortesiaModal } from '../../cortesias';
import type { CartLine } from '../lib/cart-types';
import { usePolling } from '../../../lib/use-polling';
import { getErrorMessage } from '../../../lib/errors';

const PROMO_REFRESH_MS = 60_000;

export function CartPanel() {
  const items = useCartStore((s) => s.items);
  const removeLine = useCartStore((s) => s.removeLine);
  const updateQty = useCartStore((s) => s.updateQty);
  const setNotes = useCartStore((s) => s.setNotes);
  const clear = useCartStore((s) => s.clear);
  const lastSale = useCartStore((s) => s.lastSale);
  const setLastSale = useCartStore((s) => s.setLastSale);

  const [promos, setPromos] = useState<Promotion[]>([]);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cortesiaOpen, setCortesiaOpen] = useState(false);
  const [compingLine, setCompingLine] = useState<CartLine | null>(null);
  const [cortesiaMsg, setCortesiaMsg] = useState<string | null>(null);

  const handleComped = (qty: number) => {
    const l = compingLine;
    if (!l) return;
    if (qty >= l.quantity) removeLine(l.lineId);
    else updateQty(l.lineId, l.quantity - qty);
    setCortesiaMsg(
      `Cortesía registrada (${qty}× ${l.productName}) · queda Sin revisar`,
    );
    setCompingLine(null);
  };

  usePolling(async () => {
    try {
      const data = await fetchActivePromotions();
      setPromos(data);
      setPromoError(null);
    } catch (err) {
      setPromoError(getErrorMessage(err, 'Error cargando promos'));
    }
  }, PROMO_REFRESH_MS);

  const totals = useMemo(() => computeCartTotals(items, promos), [items, promos]);

  const handleCheckoutSuccess = (s: CheckoutSuccess) => {
    setLastSale({
      id: s.saleId ?? null,
      receiptNumber: s.receiptNumber ?? null,
      provisionalNumber: s.provisionalNumber ?? null,
      turnNumber: s.turnNumber,
      total: s.total,
      paymentMethod: s.paymentMethod,
      changeDue: s.changeDue,
    });
    clear();
    setCheckoutOpen(false);
    // Auto-imprime sin botón ni ventana de navegador.
    if (s.provisionalNumber && s.receipt) {
      // Offline: el recibo ya viene armado (número provisional OFF-N).
      void printReceiptData(s.receipt).catch(() => undefined);
    } else if (s.saleId) {
      // Online: bytes del backend; si el backend cae, cae al recibo de la venta.
      void printReceipt(s.saleId, { fallback: s.sale }).catch(() => undefined);
    }
  };

  return (
    <aside className="flex h-full w-[clamp(260px,28vw,340px)] shrink-0 flex-col border-l border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
          Carrito
          <span className="ml-2 text-xs font-medium text-muted-foreground">
            {items.length} ítem{items.length === 1 ? '' : 's'}
          </span>
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setCortesiaOpen(true)}>
            Cortesía suelta
          </Button>
          {items.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={clear}>
              Vaciar
            </Button>
          ) : null}
        </div>
      </header>

      {cortesiaMsg ? (
        <div className="flex items-start justify-between gap-2 border-b border-success-border bg-success-bg px-4 py-2 text-xs text-success">
          <span>{cortesiaMsg}</span>
          <button
            type="button"
            onClick={() => setCortesiaMsg(null)}
            className="font-semibold hover:opacity-70"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      ) : null}

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
                  onNotes={(notes) => setNotes(line.lineId, notes)}
                  onCortesia={() => setCompingLine(line)}
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
        totals={totals}
        promos={promos}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={handleCheckoutSuccess}
      />

      <CortesiaModal
        open={cortesiaOpen}
        onClose={() => setCortesiaOpen(false)}
        onDone={() => undefined}
      />

      <LineCortesiaModal
        line={compingLine}
        open={compingLine !== null}
        onClose={() => setCompingLine(null)}
        onComped={handleComped}
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

