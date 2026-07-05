'use client';

import type { Sale } from '@pos-tercos/types';
import { Money, StatusBadge, cn, formatDate } from '@pos-tercos/ui';
import { useState } from 'react';
import { printReceipt } from '../api/print';
import { cancelSale } from '../api/cancel';
import { SALE_STATUS_MAPPING } from '../lib/sale-status-mapping';
import { elapsedTone, isActiveSale, minutesSince } from '../lib/history-filters';
import { methodLabel } from '../lib/history-row-config';
import { HistoryRowActions } from './HistoryRowActions';
import { HistoryRowDetails } from './HistoryRowDetails';

export function HistoryRow({
  sale,
  onChanged,
  onEdit,
  onChangePayment,
  onRefund,
}: {
  sale: Sale;
  onChanged: () => Promise<void> | void;
  onEdit: () => void;
  onChangePayment: () => void;
  onRefund: () => void;
}) {
  const [reprint, setReprint] = useState<'idle' | 'pending' | 'ok' | 'error'>('idle');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = isActiveSale(sale.status);
  const mins = minutesSince(sale.paidAt ?? sale.createdAt);
  const items = sale.items ?? [];

  const handleDelete = async () => {
    if (
      !window.confirm(
        'Eliminar este pedido sin pagar. Queda CANCELADO en el historial (auditable). ¿Continuar?',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await cancelSale(sale.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleReprint = async () => {
    setReprint('pending');
    try {
      await printReceipt(sale.id, { fallback: sale, reprint: true });
      setReprint('ok');
      setTimeout(() => setReprint('idle'), 2500);
    } catch {
      setReprint('error');
      setTimeout(() => setReprint('idle'), 2500);
    }
  };

  return (
    <li className="rounded-lg border border-border bg-card p-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-display text-base font-bold tabular-nums text-foreground">
              #{sale.receiptNumber}
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              {sale.customerName ?? (sale.type === 'WEB_PICKUP' ? 'Pedido web' : 'Mostrador')}
            </span>
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            {formatDate(sale.createdAt, 'time-short')}
            {sale.paymentMethod ? ` · ${methodLabel(sale.paymentMethod)}` : ''}
            {` · ${items.length} ít.`}
            {active ? (
              <span className={cn('ml-1 font-semibold', elapsedTone(mins))}>· {mins} min</span>
            ) : null}
            <span className="ml-1 text-muted-foreground">{open ? '▲' : '▼'}</span>
          </p>
        </div>
        <Money amount={sale.total} weight="semibold" className="shrink-0" />
      </button>

      <div className="mt-2 flex items-center justify-between gap-2">
        <StatusBadge status={sale.status} mapping={SALE_STATUS_MAPPING} />
        <HistoryRowActions
          sale={sale}
          busy={busy}
          reprint={reprint}
          onEdit={onEdit}
          onChangePayment={onChangePayment}
          onRefund={onRefund}
          onDelete={() => void handleDelete()}
          onReprint={() => void handleReprint()}
        />
      </div>

      {sale.status === 'VOID' && sale.voidReason ? (
        <p className="mt-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[0.6875rem] leading-snug text-destructive">
          <span className="font-semibold">Motivo de anulación:</span> {sale.voidReason}
        </p>
      ) : null}

      {open ? <HistoryRowDetails sale={sale} /> : null}
    </li>
  );
}
