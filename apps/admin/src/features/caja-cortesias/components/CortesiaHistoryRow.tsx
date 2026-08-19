'use client';

import type { CortesiaRequest } from '@pos-tercos/types';
import { Money, cn, formatDate } from '@pos-tercos/ui';
import { useState } from 'react';
import { CortesiaDetailModal } from './CortesiaDetailModal';
import { CORTESIA_STATUS_LABEL, CORTESIA_STATUS_TONE } from '../lib/status';

/**
 * Una cortesía como fila del historial del día, al lado de los pedidos
 * cobrados. Rotulada "Cortesía" y con el valor regalado tachado: es un pedido
 * que salió de la cocina y que el negocio NO cobró (pérdida), no un pedido más.
 */
export function CortesiaHistoryRow({ cortesia }: { cortesia: CortesiaRequest }) {
  const [detail, setDetail] = useState(false);
  const reversed = cortesia.status === 'REVERSED';
  return (
    <li
      className={cn(
        'rounded-lg border bg-card p-2.5',
        reversed ? 'border-border' : 'border-warning-border',
      )}
    >
      {/* Se toca la fila y se ve el detalle, igual que un pedido cobrado. */}
      <button
        type="button"
        onClick={() => setDetail(true)}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex shrink-0 items-center rounded-full border border-warning-border bg-warning-bg px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-warning">
              Cortesía
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              {cortesia.quantity}× {cortesia.productName ?? 'Producto'}
              {cortesia.sizeName ? ` · ${cortesia.sizeName}` : ''}
            </span>
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            {formatDate(cortesia.createdAt, 'time-short')}
            {cortesia.requestedByName ? ` · ${cortesia.requestedByName}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Money
            amount={cortesia.salePrice}
            weight="semibold"
            className={cn(reversed ? 'text-muted-foreground' : 'line-through text-muted-foreground')}
          />
          <p
            className={cn(
              'text-[0.625rem] font-semibold',
              reversed ? 'text-muted-foreground' : 'text-warning',
            )}
          >
            {reversed ? 'no cuenta' : 'regalado · no se cobró'}
          </p>
        </div>
      </button>

      <p className="mt-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-[0.6875rem] leading-snug text-muted-foreground">
        <span className="font-semibold text-foreground">Motivo:</span> {cortesia.reason}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={cn('text-xs font-semibold', CORTESIA_STATUS_TONE[cortesia.status])}>
          {CORTESIA_STATUS_LABEL[cortesia.status]}
        </span>
        {reversed && cortesia.resolverNote ? (
          <span className="truncate text-[0.6875rem] text-muted-foreground">
            {cortesia.resolverNote}
          </span>
        ) : null}
      </div>

      {detail ? (
        <CortesiaDetailModal cortesia={cortesia} onClose={() => setDetail(false)} />
      ) : null}
    </li>
  );
}
