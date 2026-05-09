'use client';

import type { Sale } from '@pos-tercos/types';
import { Button, Countdown, StatusBadge, cn, type StatusMapping } from '@pos-tercos/ui';
import { BrandIcon } from '@pos-tercos/brand';
import { useState } from 'react';
import { readyOrder, startOrder } from '../api/transitions';
import { useElapsed } from '../hooks/useElapsed';
import { openWhatsAppReady } from '../lib/whatsapp';

const STATUS_MAPPING: StatusMapping = {
  PAGADO: { label: 'En cola', tone: 'warning', pulse: true },
  EN_PREPARACION: { label: 'En preparación', tone: 'primary', pulse: true },
  LISTO_DESPACHO: { label: 'Listo', tone: 'success' },
};

const ESCALATE_AFTER_MINS = 10;

export function OrderCard({ order }: { order: Sale }) {
  const [pending, setPending] = useState<'start' | 'ready' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(order.paidAt);

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
      openWhatsAppReady(order);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setPending(null);
    }
  };

  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border bg-card p-4 transition-colors',
        isLate
          ? 'border-destructive ring-2 ring-destructive/30'
          : order.status === 'LISTO_DESPACHO'
            ? 'border-success-border'
            : 'border-border',
      )}
    >
      <header className="flex items-baseline justify-between gap-3">
        <span className="font-display text-3xl font-extrabold tabular tracking-tight text-foreground">
          #{order.receiptNumber}
        </span>
        <StatusBadge status={order.status} mapping={STATUS_MAPPING} size="sm" />
      </header>

      <div className="mt-2 flex items-center gap-2">
        {order.status === 'EN_PREPARACION' ? (
          <BrandIcon
            name="flame"
            className={cn('h-4 w-4', isLate ? 'text-destructive' : 'text-primary')}
          />
        ) : null}
        <Countdown
          startedAt={order.paidAt}
          warningAfterMinutes={7}
          dangerAfterMinutes={ESCALATE_AFTER_MINS}
          className="font-display text-2xl font-bold tabular"
        />
      </div>

      {order.customerName ? (
        <p className="mt-2 text-sm font-medium text-foreground">{order.customerName}</p>
      ) : null}

      <ul className="mt-3 flex-1 space-y-1.5 text-sm text-foreground">
        {(order.items ?? []).map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <span className="font-mono font-bold tabular text-muted-foreground">
              ×{item.quantity}
            </span>
            <span className="flex-1">
              <span className="font-medium">{item.productName ?? 'producto'}</span>
              {item.sizeName ? (
                <span className="text-muted-foreground"> · {item.sizeName}</span>
              ) : null}
              {item.modifiers && item.modifiers.length > 0 ? (
                <span className="text-muted-foreground">
                  {' · '}
                  {item.modifiers.map((m) => m.name).join(', ')}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      <footer className="mt-4">
        {order.status === 'PAGADO' ? (
          <Button
            onClick={handleStart}
            disabled={pending !== null}
            size="xl"
            className="w-full"
          >
            {pending === 'start' ? 'Iniciando…' : 'Iniciar'}
          </Button>
        ) : null}
        {order.status === 'EN_PREPARACION' ? (
          <Button
            onClick={handleReady}
            disabled={pending !== null}
            variant="success"
            size="xl"
            className="w-full"
          >
            {pending === 'ready' ? 'Marcando…' : 'Marcar listo'}
          </Button>
        ) : null}
        {order.status === 'LISTO_DESPACHO' ? (
          <p className="text-center text-sm font-semibold text-success">
            ✓ Listo para entregar
          </p>
        ) : null}
      </footer>
    </article>
  );
}
