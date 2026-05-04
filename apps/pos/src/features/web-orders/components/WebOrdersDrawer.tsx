'use client';

import type { PublicWebOrder, Sale } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { COP } from '../../catalog/lib/format';
import { useWebOrdersSocket, type ConnectionState } from '../hooks/useWebOrdersSocket';
import { openWhatsAppForSale } from '../lib/whatsapp';
import { ConfirmWebPaymentModal } from './ConfirmWebPaymentModal';

export function WebOrdersDrawer({
  open,
  onClose,
  initial,
  wsToken,
}: {
  open: boolean;
  onClose: () => void;
  initial: PublicWebOrder[];
  wsToken: string | null;
}) {
  const { orders, connection, removeLocal } = useWebOrdersSocket(initial, wsToken);
  const [confirming, setConfirming] = useState<PublicWebOrder | null>(null);

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

  const handleConfirmed = (sale: Sale) => {
    if (sale.type !== 'COUNTER') {
      removeLocal(sale.id);
    }
    setConfirming(null);
  };

  return (
    <>
      {open ? (
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
          >
            <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  Pedidos web pendientes
                </h2>
                <p className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
                  <ConnectionDot state={connection} />
                  <span>{orders.length} en espera</span>
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-y-auto">
              {orders.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500">
                  Cuando alguien haga un pedido desde la web, aparece acá.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {orders.map((o) => (
                    <li key={o.id} className="px-4 py-3">
                      <WebOrderRow
                        order={o}
                        onConfirm={() => setConfirming(o)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      <ConfirmWebPaymentModal
        order={confirming}
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirmed={handleConfirmed}
      />
    </>
  );
}

function WebOrderRow({
  order,
  onConfirm,
}: {
  order: PublicWebOrder;
  onConfirm: () => void;
}) {
  const created = new Date(order.createdAt);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const handleAccept = () => {
    setPopupBlocked(false);
    const r = openWhatsAppForSale(order, 'accepted');
    if (!r.opened && r.reason === 'popup-blocked') {
      setPopupBlocked(true);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-extrabold tabular-nums">#{order.receiptNumber}</span>
        <span className="text-xs text-gray-500">
          {created.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="mt-0.5 text-sm font-medium text-gray-900">{order.customerName}</p>
      <p className="text-xs text-gray-500">
        {order.customerPhone}
        {' · '}
        {order.type === 'WEB_PICKUP' ? 'Recoger' : 'Domicilio'}
      </p>
      {order.deliveryAddress ? (
        <p className="mt-0.5 text-xs text-gray-500">{order.deliveryAddress}</p>
      ) : null}
      <p className="mt-2 text-base font-bold tabular-nums">
        {COP.format(order.total)}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          size="sm"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          onClick={handleAccept}
        >
          📱 Aceptar y contactar
        </Button>
        <Button size="sm" variant="ghost" onClick={onConfirm}>
          Confirmar pago
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
        Pedí el comprobante por WhatsApp. Cuando llegue, "Confirmar pago".
      </p>
      {popupBlocked && (
        <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          El navegador bloqueó WhatsApp. Permití popups para esta página y volvé a intentar.
        </p>
      )}
    </div>
  );
}

function ConnectionDot({ state }: { state: ConnectionState }) {
  const map = {
    connecting: 'bg-amber-500',
    connected: 'bg-emerald-500',
    disconnected: 'bg-gray-400',
    error: 'bg-red-500',
  } as const;
  return <span className={`inline-block h-2 w-2 rounded-full ${map[state]}`} aria-hidden />;
}
