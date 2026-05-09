'use client';

import type { PublicWebOrder, Sale } from '@pos-tercos/types';
import {
  Button,
  ConnectionDot,
  Drawer,
  EmptyState,
  Money,
  cn,
  formatDate,
} from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useWebOrdersSocket, type ConnectionState } from '../hooks/useWebOrdersSocket';
import { openWhatsAppForSale } from '../lib/whatsapp';
import { ConfirmWebPaymentModal } from './ConfirmWebPaymentModal';

const STATE_MAP: Record<ConnectionState, 'live' | 'connecting' | 'error' | 'idle'> = {
  connected: 'live',
  connecting: 'connecting',
  error: 'error',
  disconnected: 'idle',
};

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

  const handleConfirmed = (sale: Sale) => {
    if (sale.type !== 'COUNTER') {
      removeLocal(sale.id);
    }
    setConfirming(null);
  };

  return (
    <>
      <Drawer open={open} onClose={onClose} label="Pedidos web pendientes">
        <Drawer.Header
          title="Pedidos web"
          subtitle={`${orders.length} en espera`}
          onClose={onClose}
          trailing={<ConnectionDot state={STATE_MAP[connection]} />}
        />
        <Drawer.Body className="p-0">
          {orders.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 py-8">
              <EmptyState
                illustration={<LineArtIllustration name="empty-cart" />}
                title="Sin pedidos pendientes"
                description="Cuando alguien haga un pedido desde la web, aparece acá."
                size="sm"
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((o) => (
                <li key={o.id} className="px-5 py-4">
                  <WebOrderRow order={o} onConfirm={() => setConfirming(o)} />
                </li>
              ))}
            </ul>
          )}
        </Drawer.Body>
      </Drawer>

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
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-2xl font-extrabold tabular tracking-tight text-foreground">
          #{order.receiptNumber}
        </span>
        <span className="tabular text-xs text-muted-foreground">
          {formatDate(order.createdAt, 'time-short')}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">{order.customerName}</p>
      <p className="text-xs text-muted-foreground">
        {order.customerPhone}
        {' · '}
        {order.type === 'WEB_PICKUP' ? 'Recoger' : 'Domicilio'}
      </p>
      {order.deliveryAddress ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{order.deliveryAddress}</p>
      ) : null}
      <Money amount={order.total} size="lg" weight="bold" className="mt-2" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="success" size="sm" onClick={handleAccept}>
          <MessageCircle className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
          Aceptar y contactar
        </Button>
        <Button variant="outline" size="sm" onClick={onConfirm}>
          Confirmar pago
        </Button>
      </div>
      <p className={cn('mt-2 text-[0.6875rem] leading-snug text-muted-foreground')}>
        Pide el comprobante por WhatsApp. Cuando llegue, &ldquo;Confirmar pago&rdquo;.
      </p>
      {popupBlocked ? (
        <p className="mt-1.5 rounded-md border border-warning-border bg-warning-bg px-2 py-1 text-[0.6875rem] text-warning">
          El navegador bloqueó WhatsApp. Permití popups para esta página y volvé a intentar.
        </p>
      ) : null}
    </div>
  );
}
