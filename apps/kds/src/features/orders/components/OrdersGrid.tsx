'use client';

import type { Sale } from '@pos-tercos/types';
import { useKDSSocket } from '../hooks/useKDSSocket';
import { OrderCard } from './OrderCard';

export function OrdersGrid({ initial, wsToken }: { initial: Sale[]; wsToken: string | null }) {
  const { orders, connection } = useKDSSocket(initial, wsToken);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2 text-xs text-gray-600">
        <span>{orders.length} en cola</span>
        <ConnectionBadge state={connection} />
      </div>
      {orders.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center text-gray-400">
          <div>
            <p className="text-2xl">Sin pedidos en cola</p>
            <p className="mt-1 text-sm">Cuando se cobra una venta aparecerá acá automáticamente.</p>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionBadge({ state }: { state: 'connecting' | 'connected' | 'disconnected' | 'error' }) {
  const map = {
    connecting: { dot: 'bg-amber-500', label: 'Conectando…' },
    connected: { dot: 'bg-emerald-500', label: 'En vivo' },
    disconnected: { dot: 'bg-gray-400', label: 'Desconectado' },
    error: { dot: 'bg-red-500', label: 'Error WS' },
  } as const;
  const { dot, label } = map[state];
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}
