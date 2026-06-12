'use client';

import {
  PAYMENT_METHOD_LABELS,
  type CashMovement,
  type ShiftSessionOrder,
} from '@pos-tercos/types';
import { Money, cn, formatDate } from '@pos-tercos/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

const label = (m: string): string =>
  PAYMENT_METHOD_LABELS[m as keyof typeof PAYMENT_METHOD_LABELS] ?? m;

/** Fila de sección mayor (MONTO INICIAL / INGRESOS / EGRESO / Total). */
export function SectionRow({
  title,
  amount,
  negative = false,
  strong = false,
}: {
  title: string;
  amount: number;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-t border-border px-3 py-2',
        strong ? 'bg-muted/50' : '',
      )}
    >
      <span className={cn('text-sm font-bold uppercase tracking-wide', strong ? 'text-foreground' : 'text-foreground')}>
        {title}
      </span>
      <span className={cn('text-sm font-bold tabular-nums', negative ? 'text-destructive' : 'text-foreground')}>
        {negative && amount > 0 ? '−' : ''}
        <Money amount={amount} weight="bold" className="text-current" />
      </span>
    </div>
  );
}

/**
 * Fila por método dentro de INGRESOS/EGRESO, expandible: muestra las ventas
 * de ese método y/o los movimientos de caja que lo componen.
 */
export function MethodRow({
  method,
  amount,
  orders = [],
  movements = [],
}: {
  method: string;
  amount: number;
  orders?: ShiftSessionOrder[];
  movements?: CashMovement[];
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = orders.length > 0 || movements.length > 0;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="border-t border-border/60">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!hasDetail}
        className={cn(
          'flex w-full items-center justify-between px-3 py-1.5 pl-6 text-sm',
          hasDetail ? 'transition-colors hover:bg-muted/30' : 'cursor-default',
        )}
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Chevron
            className={cn('h-3.5 w-3.5', hasDetail ? '' : 'opacity-0')}
            aria-hidden
          />
          {label(method)}
        </span>
        <Money amount={amount} size="sm" weight="medium" />
      </button>
      {open && hasDetail ? (
        <ul className="space-y-0.5 px-3 pb-2 pl-12 text-xs text-muted-foreground">
          {orders.map((o) => (
            <li key={o.id} className="flex justify-between gap-2 tabular-nums">
              <span className="min-w-0 truncate">
                {o.turnNumber !== null ? `Turno ${o.turnNumber}` : `Recibo #${o.receiptNumber}`}
                {' · '}
                {formatDate(o.createdAt, 'time')}
                {o.customerName ? ` · ${o.customerName}` : ''}
              </span>
              <Money amount={o.total} size="xs" className="shrink-0 text-current" />
            </li>
          ))}
          {movements.map((m) => (
            <li key={m.id} className="flex justify-between gap-2 tabular-nums">
              <span className="min-w-0 truncate">
                {m.type === 'IN' ? '↑' : '↓'} {m.reason}
              </span>
              <Money amount={m.amount} size="xs" className="shrink-0 text-current" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
