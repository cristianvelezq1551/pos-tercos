'use client';

import type { Sale } from '@pos-tercos/types';
import { ConnectionDot, EmptyState } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { useKDSSocket } from '../hooks/useKDSSocket';
import { OrderCard } from './OrderCard';

const STATE_MAP = {
  connecting: 'connecting',
  connected: 'live',
  disconnected: 'idle',
  error: 'error',
} as const;

export function OrdersGrid({ initial, wsToken }: { initial: Sale[]; wsToken: string | null }) {
  const { orders, connection } = useKDSSocket(initial, wsToken);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-5 py-3">
        <span className="caps text-[0.6875rem] text-muted-foreground">
          {orders.length} {orders.length === 1 ? 'pedido en cola' : 'pedidos en cola'}
        </span>
        <ConnectionDot state={STATE_MAP[connection]} label />
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <EmptyState
            illustration={<LineArtIllustration name="empty-plate" />}
            title="Sin pedidos en cola"
            description="Cuando se cobra una venta aparecerá aquí automáticamente."
            size="md"
          />
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}
