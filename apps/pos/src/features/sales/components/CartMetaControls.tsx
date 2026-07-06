'use client';

import { Button } from '@pos-tercos/ui';
import { useRef, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import { logError } from '../../../lib/client-log';
import { randomUUID } from '../../../lib/uuid';
import { createSale } from '../api/create';
import { sendTabToKitchen } from '../api/print';
import { notifyComandaFailed } from '../lib/comanda-events';
import { notifyOrdersChanged } from '../lib/orders-events';
import { cartLinesToCreateItems, useCartStore } from '../store/cart-store';
import { DiscountModal } from './DiscountModal';

/**
 * Fila de datos del pedido en el carrito: nombre del cliente (#1), descuento
 * manual (#5b) y "Abrir cuenta" (#3 — deja el pedido sin pagar, manda la
 * comanda de la tanda y limpia el carrito). Oculta descuento/cuenta offline.
 */
export function CartMetaControls({
  offline,
  onInfo,
}: {
  offline: boolean;
  onInfo: (msg: string) => void;
}) {
  const items = useCartStore((s) => s.items);
  const customerName = useCartStore((s) => s.customerName);
  const setCustomerName = useCartStore((s) => s.setCustomerName);
  const lineDiscounts = useCartStore((s) => s.lineDiscounts);
  const orderDiscount = useCartStore((s) => s.orderDiscount);
  const discountReason = useCartStore((s) => s.discountReason);
  const clearDiscounts = useCartStore((s) => s.clearDiscounts);
  const clear = useCartStore((s) => s.clear);

  const [discountOpen, setDiscountOpen] = useState(false);
  const [tabPending, setTabPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guard SÍNCRONO contra doble-click: `tabPending` (estado React) se propaga
  // async y cada llamada genera un idempotency-key NUEVO — sin la ref, dos
  // clicks rápidos creaban DOS cuentas abiertas (mismo patrón que el checkout).
  const submittingRef = useRef(false);

  const hasDiscount = orderDiscount !== null || Object.keys(lineDiscounts).length > 0;

  const handleOpenTab = async () => {
    if (submittingRef.current || tabPending || items.length === 0) return;
    if (!customerName.trim()) {
      setError('Poné el nombre del cliente para abrir la cuenta.');
      return;
    }
    submittingRef.current = true;
    setTabPending(true);
    setError(null);
    try {
      const sale = await createSale(
        {
          type: 'COUNTER',
          openTab: true,
          items: cartLinesToCreateItems(items, offline ? {} : lineDiscounts),
          customerName: customerName.trim(),
          orderDiscount: !offline && orderDiscount ? orderDiscount : undefined,
          discountReason: !offline && hasDiscount && discountReason ? discountReason : undefined,
        },
        randomUUID(),
      );
      // Comanda de la primera tanda — best-effort (reintentable desde el panel).
      await sendTabToKitchen(sale.id).catch((e) => {
        logError('open-tab.comanda', e, { saleId: sale.id });
        notifyComandaFailed({ saleId: sale.id, receiptNumber: sale.receiptNumber, kind: 'tanda' });
      });
      clear();
      notifyOrdersChanged();
      onInfo(`Cuenta abierta #${sale.receiptNumber} · ${sale.customerName ?? ''} · comanda enviada`);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir la cuenta'));
    } finally {
      submittingRef.current = false;
      setTabPending(false);
    }
  };

  return (
    <div className="space-y-2 border-b border-border px-4 py-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          maxLength={120}
          placeholder="Cliente (opcional)"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
          aria-label="Nombre del cliente"
        />
        {!offline ? (
          <>
            <Button
              variant={hasDiscount ? 'default' : 'outline'}
              size="sm"
              disabled={items.length === 0}
              onClick={() => setDiscountOpen(true)}
            >
              {hasDiscount ? 'Desc. ✓' : 'Desc.'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={items.length === 0 || tabPending}
              onClick={() => void handleOpenTab()}
            >
              {tabPending ? 'Abriendo…' : 'Cuenta'}
            </Button>
          </>
        ) : null}
      </div>
      {hasDiscount ? (
        offline ? (
          // Sin red los descuentos manuales NO viajan (el sync offline no los
          // representa): avisar en vez de mostrar un "activo" mentiroso.
          <p className="flex items-center justify-between gap-2 text-xs text-destructive">
            <span className="truncate">Sin conexión: el descuento manual NO aplica (se cobra con promos normales)</span>
            <button type="button" className="font-semibold hover:opacity-70" onClick={clearDiscounts}>
              Quitar
            </button>
          </p>
        ) : (
          <p className="flex items-center justify-between gap-2 text-xs text-warning">
            <span className="truncate">Descuento manual activo · promos desactivadas</span>
            <button type="button" className="font-semibold hover:opacity-70" onClick={clearDiscounts}>
              Quitar
            </button>
          </p>
        )
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <DiscountModal open={discountOpen} onClose={() => setDiscountOpen(false)} />
    </div>
  );
}
