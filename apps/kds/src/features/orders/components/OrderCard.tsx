'use client';

import type { Sale } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { useState } from 'react';
import { readyOrder, startOrder } from '../api/transitions';
import { useElapsed } from '../hooks/useElapsed';

const STATUS_STYLES: Record<string, { bg: string; ring: string; label: string }> = {
  PAGADO: { bg: 'bg-amber-50', ring: 'ring-amber-300', label: 'En cola' },
  EN_PREPARACION: { bg: 'bg-blue-50', ring: 'ring-blue-300', label: 'En preparación' },
  LISTO_DESPACHO: { bg: 'bg-emerald-50', ring: 'ring-emerald-300', label: 'Listo' },
};

const ESCALATE_AFTER_MINS = 10;

export function OrderCard({ order }: { order: Sale }) {
  const [pending, setPending] = useState<'start' | 'ready' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(order.paidAt);

  const styles = STATUS_STYLES[order.status] ?? STATUS_STYLES.PAGADO!;
  const isLate = elapsed !== null && elapsed.mins >= ESCALATE_AFTER_MINS;

  const handleStart = async () => {
    setPending('start');
    setError(null);
    try {
      await startOrder(order.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setPending(null);
    }
  };
  const handleReady = async () => {
    setPending('ready');
    setError(null);
    try {
      await readyOrder(order.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setPending(null);
    }
  };

  return (
    <article
      className={`flex flex-col rounded-lg p-4 ring-2 ${styles.bg} ${
        isLate ? 'ring-red-500 ring-4' : styles.ring
      }`}
    >
      <header className="flex items-baseline justify-between">
        <span className="text-3xl font-extrabold tabular-nums">#{order.receiptNumber}</span>
        <span className={`rounded-full bg-white px-2 py-0.5 text-xs font-semibold ${
          isLate ? 'text-red-700' : 'text-gray-700'
        }`}>
          {styles.label}
        </span>
      </header>

      {elapsed ? (
        <p
          className={`mt-1 font-mono text-sm tabular-nums ${
            isLate ? 'font-bold text-red-700' : 'text-gray-600'
          }`}
        >
          {String(elapsed.mins).padStart(2, '0')}:{String(elapsed.secs).padStart(2, '0')}
          {isLate ? ' ⚠' : ''}
        </p>
      ) : null}

      {order.customerName ? (
        <p className="mt-1 text-sm font-medium text-gray-700">{order.customerName}</p>
      ) : null}

      <ul className="mt-3 flex-1 space-y-1 text-sm text-gray-800">
        {(order.items ?? []).map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <span className="font-mono font-bold tabular-nums">×{item.quantity}</span>
            <span className="flex-1">
              <span className="font-medium">{item.productName ?? 'producto'}</span>
              {item.sizeName ? <span className="text-gray-500"> · {item.sizeName}</span> : null}
              {item.modifiers && item.modifiers.length > 0 ? (
                <span className="text-gray-500">
                  {' · '}
                  {item.modifiers.map((m) => m.name).join(', ')}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {error ? (
        <p className="mt-2 rounded bg-red-100 px-2 py-1 text-xs text-red-800">{error}</p>
      ) : null}

      <footer className="mt-4">
        {order.status === 'PAGADO' ? (
          <Button
            onClick={handleStart}
            disabled={pending !== null}
            className="h-14 w-full text-lg font-bold"
          >
            {pending === 'start' ? 'Iniciando…' : 'Iniciar'}
          </Button>
        ) : null}
        {order.status === 'EN_PREPARACION' ? (
          <Button
            onClick={handleReady}
            disabled={pending !== null}
            className="h-14 w-full bg-emerald-600 text-lg font-bold hover:bg-emerald-700"
          >
            {pending === 'ready' ? 'Marcando…' : 'Marcar listo'}
          </Button>
        ) : null}
        {order.status === 'LISTO_DESPACHO' ? (
          <p className="text-center text-sm font-medium text-emerald-700">✓ Listo para entregar</p>
        ) : null}
      </footer>
    </article>
  );
}
