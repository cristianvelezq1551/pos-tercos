'use client';

import {
  PAYMENT_METHOD_LABELS,
  type CashMovement,
  type ShiftSessionOrder,
} from '@pos-tercos/types';
import { Money, cn, formatDate } from '@pos-tercos/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const label = (m: string): string =>
  PAYMENT_METHOD_LABELS[m as keyof typeof PAYMENT_METHOD_LABELS] ?? m;

/** Venta listada bajo un método: cuánto aportó ESE método (parte si dividió). */
export interface MethodOrderEntry {
  order: ShiftSessionOrder;
  amount: number;
  /** true = cuenta dividida (este monto es solo la parte de este método). */
  isPart: boolean;
}

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
      <span className="text-sm font-bold uppercase tracking-wide text-foreground">
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
 * Fila por método dentro de INGRESOS/EGRESO, expandible: cada venta que
 * aportó a ese método (con sus productos) y los movimientos de caja.
 */
export function MethodRow({
  method,
  amount,
  entries = [],
  movements = [],
  href,
  count,
}: {
  method: string;
  amount: number;
  entries?: MethodOrderEntry[];
  movements?: CashMovement[];
  /** Si está presente, la fila NAVEGA al detalle en vez de expandir inline. */
  href?: string;
  /** Cantidad de ventas (solo para el modo navegación). */
  count?: number;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = entries.length > 0 || movements.length > 0;
  const Chevron = open ? ChevronDown : ChevronRight;

  if (href) {
    return (
      <Link
        href={href}
        className="flex items-center justify-between border-t border-border/60 px-3 py-2 pl-6 text-sm transition-colors hover:bg-muted/30"
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {label(method)}
          {count !== undefined && count > 0 ? (
            <span className="text-xs text-muted-foreground/70">
              · {count} venta{count === 1 ? '' : 's'}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5">
          <Money amount={amount} size="sm" weight="medium" />
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </span>
      </Link>
    );
  }

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
          <Chevron className={cn('h-3.5 w-3.5', hasDetail ? '' : 'opacity-0')} aria-hidden />
          {label(method)}
          {entries.length > 0 ? (
            <span className="text-xs text-muted-foreground/70">
              · {entries.length} venta{entries.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </span>
        <Money amount={amount} size="sm" weight="medium" />
      </button>
      {open && hasDetail ? (
        <div className="space-y-1.5 px-3 pb-2 pl-12">
          {entries.map(({ order: o, amount: part, isPart }) => (
            <div key={o.id} className="text-xs">
              <div className="flex justify-between gap-2 tabular-nums text-foreground">
                <span className="min-w-0 truncate font-medium">
                  {`Recibo #${o.receiptNumber}`}
                  {' · '}
                  {formatDate(o.createdAt, 'time')}
                  {o.customerName ? ` · ${o.customerName}` : ''}
                  {isPart ? (
                    <span className="text-muted-foreground"> · parte de cuenta dividida</span>
                  ) : null}
                </span>
                <Money amount={part} size="xs" className="shrink-0 text-current" />
              </div>
              {o.items.length > 0 ? (
                <p className="truncate text-[0.6875rem] text-muted-foreground">
                  {o.items.map((it) => `${it.quantity}× ${it.name}`).join(' · ')}
                </p>
              ) : null}
            </div>
          ))}
          {movements.map((m) => (
            <div
              key={m.id}
              className="flex justify-between gap-2 text-xs tabular-nums text-muted-foreground"
            >
              <span className="min-w-0 truncate">
                {m.type === 'IN' ? '↑' : '↓'} {m.reason}
              </span>
              <Money amount={m.amount} size="xs" className="shrink-0 text-current" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
