'use client';

import { Button, EmptyState } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import type { Promotion } from '@pos-tercos/types';
import { useMemo, useState } from 'react';
import { fetchActivePromotions } from '../api';
import { computeCartTotals } from '../lib/totals';
import { printCheckoutReceipt } from '../lib/print-on-checkout';
import { notifyOrdersChanged } from '../lib/orders-events';
import { useCartStore } from '../store/cart-store';
import { CartLineRow } from './CartLineRow';
import { CartFooter } from './CartFooter';
import { CartMetaControls } from './CartMetaControls';
import { CheckoutModal, type CheckoutSuccess } from './CheckoutModal';
import { useFacturaPrint } from '../hooks/useFacturaPrint';
import { OrderCortesiaModal } from '../../caja-cortesias';
import { useOffline } from '../../offline';
import { usePolling } from '../../../lib/use-polling';
import { getErrorMessage } from '../../../lib/errors';

const PROMO_REFRESH_MS = 60_000;

export function CartPanel() {
  const items = useCartStore((s) => s.items);
  const removeLine = useCartStore((s) => s.removeLine);
  const separarLinea = useCartStore((s) => s.separarLinea);
  const updateQty = useCartStore((s) => s.updateQty);
  const setNotes = useCartStore((s) => s.setNotes);
  const clear = useCartStore((s) => s.clear);
  const lastSale = useCartStore((s) => s.lastSale);
  const setLastSale = useCartStore((s) => s.setLastSale);
  const customerName = useCartStore((s) => s.customerName);
  const lineDiscounts = useCartStore((s) => s.lineDiscounts);
  const orderDiscount = useCartStore((s) => s.orderDiscount);
  const discountReason = useCartStore((s) => s.discountReason);
  const { status: offlineStatus } = useOffline();
  const offline = offlineStatus === 'offline';

  const [promos, setPromos] = useState<Promotion[]>([]);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cortesiaOpen, setCortesiaOpen] = useState(false);
  const [cortesiaMsg, setCortesiaMsg] = useState<string | null>(null);
  const { requestFactura, facturaModal } = useFacturaPrint();

  const handleCortesiaDone = () => {
    clear();
    setCortesiaOpen(false);
    setCortesiaMsg('Pedido marcado como cortesía · queda en el historial del día');
    // Sin esto la cortesía no aparecía hasta el siguiente poll (o hasta
    // recargar): es un pedido del día como cualquier otro y las listas tienen
    // que enterarse al instante, igual que con un cobro.
    notifyOrdersChanged();
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

  // Offline los descuentos manuales se ignoran (el sync no los representa y
  // la UI los oculta); online espejan exactamente el cálculo del backend.
  const totals = useMemo(
    () =>
      computeCartTotals(
        items,
        promos,
        undefined,
        offline ? undefined : { lineDiscounts, orderDiscount },
      ),
    [items, promos, offline, lineDiscounts, orderDiscount],
  );

  const checkoutMeta = useMemo(
    () => ({
      customerName: customerName.trim() ? customerName.trim() : null,
      lineDiscounts: offline ? {} : lineDiscounts,
      orderDiscount: offline ? null : orderDiscount,
      discountReason: discountReason.trim() ? discountReason.trim() : null,
    }),
    [customerName, lineDiscounts, orderDiscount, discountReason, offline],
  );

  const handleCheckoutSuccess = (s: CheckoutSuccess) => {
    setLastSale({
      id: s.saleId ?? null,
      receiptNumber: s.receiptNumber ?? null,
      provisionalNumber: s.provisionalNumber ?? null,
      total: s.total,
      paymentMethod: s.paymentMethod,
      changeDue: s.changeDue,
    });
    clear();
    setCheckoutOpen(false);
    notifyOrdersChanged();
    // Online: la comanda ya salió al confirmar → la factura va por requestFactura
    // (modal si comparte impresora con la comanda, directo si no). Offline no
    // tiene comanda → imprime el recibo provisional directo.
    if (s.saleId) {
      requestFactura({
        receiptNumber: s.receiptNumber ?? null,
        total: s.total,
        print: () => printCheckoutReceipt(s),
      });
    } else {
      printCheckoutReceipt(s);
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
        {items.length > 0 ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setCortesiaOpen(true)}>
              Cortesía
            </Button>
            <Button variant="ghost" size="sm" onClick={clear}>
              Vaciar
            </Button>
          </div>
        ) : null}
      </header>

      <CartMetaControls offline={offline} onInfo={setCortesiaMsg} />

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
                  onSeparar={() => separarLinea(line.lineId)}
                  onRemove={() => removeLine(line.lineId)}
                  onNotes={(notes) => setNotes(line.lineId, notes)}
                />
              );
            })}
          </ul>
        )}
      </div>

      <CartFooter
        totals={totals}
        itemsCount={items.length}
        promoError={promoError}
        lastSale={lastSale}
        onCheckout={() => setCheckoutOpen(true)}
        onDismissLastSale={() => setLastSale(null)}
      />

      <CheckoutModal
        open={checkoutOpen}
        total={totals.total}
        items={items}
        totals={totals}
        promos={promos}
        meta={checkoutMeta}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={handleCheckoutSuccess}
      />

      <OrderCortesiaModal
        items={items}
        open={cortesiaOpen}
        onClose={() => setCortesiaOpen(false)}
        onDone={handleCortesiaDone}
      />

      {facturaModal}
    </aside>
  );
}
