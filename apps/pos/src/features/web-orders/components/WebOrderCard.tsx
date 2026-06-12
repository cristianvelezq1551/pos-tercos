'use client';

import type { Sale } from '@pos-tercos/types';
import { Button, Checkbox, Money, StatusBadge, cn, formatDate } from '@pos-tercos/ui';
import { useState } from 'react';
import { SALE_STATUS_MAPPING } from '../../sales';
import { cancelWebOrder, markWebOrderReady } from '../api';
import { getErrorMessage } from '../../../lib/errors';

/** Solo a partir de este tiempo ofrecemos "no avisar" (actualización retroactiva). */
const STALE_MIN = 15;

function minutesSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

/** Color del tiempo: verde <7 min, ámbar 7-10, rojo >10 (igual que el KDS). */
function elapsedTone(sale: Sale): string {
  const m = minutesSince(sale.paidAt ?? sale.createdAt);
  if (m >= 10) return 'text-destructive';
  if (m >= 7) return 'text-warning';
  return 'text-success';
}

export function WebOrderCard({
  sale,
  onConfirm,
  onChanged,
}: {
  sale: Sale;
  onConfirm: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [silent, setSilent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // "No avisar" solo para pedidos viejos (≥15 min en su estado actual).
  const stale = minutesSince(sale.paidAt ?? sale.createdAt) >= STALE_MIN;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setErr(getErrorMessage(e, 'Error'));
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-2xl font-extrabold tracking-tight text-foreground">
          #{sale.receiptNumber}
        </span>
        <StatusBadge status={sale.status} mapping={SALE_STATUS_MAPPING} />
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {sale.customerName ?? 'Pedido web'}
      </p>
      <p className="text-xs text-muted-foreground">
        {sale.customerPhone ?? ''} · {formatDate(sale.createdAt, 'time-short')}
        <span className={cn('ml-1 font-semibold', elapsedTone(sale))}>
          · {minutesSince(sale.paidAt ?? sale.createdAt)} min
        </span>
      </p>
      <Money amount={sale.total} size="lg" weight="bold" className="mt-2" />

      <div className="mt-3">
        {sale.status === 'PENDIENTE_PAGO' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="success" size="sm" onClick={onConfirm} disabled={busy}>
              Confirmar pago
            </Button>
            {confirmReject ? (
              <div className="flex gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => run(() => cancelWebOrder(sale.id))}
                >
                  {busy ? '…' : 'Sí, rechazar'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirmReject(false)}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmReject(true)}
              >
                Rechazar
              </Button>
            )}
          </div>
        ) : sale.status === 'PAGADO' ? (
          // Pagado, en cola de cocina. El cajero NO inicia pedidos (eso es del
          // KDS); solo espera a que la cocina lo tome.
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
            En cola de cocina — la cocina lo inicia
          </p>
        ) : sale.status === 'EN_PREPARACION' ? (
          // Solo se marca listo cuando ya está iniciado en cocina.
          <div className="space-y-2">
            {stale ? (
              <div className="rounded-lg border border-warning-border bg-warning-bg/40 px-3 py-2">
                <Checkbox
                  checked={silent}
                  onChange={(e) => setSilent(e.target.checked)}
                  label="No avisar al cliente"
                  description="Pedido viejo (+15 min) — actualización retroactiva sin WhatsApp."
                />
              </div>
            ) : null}
            <Button
              variant="success"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => run(() => markWebOrderReady(sale.id, stale && silent))}
            >
              {busy ? 'Marcando…' : 'Marcar listo'}
            </Button>
          </div>
        ) : null}
      </div>
      {err ? (
        <p className="mt-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[0.6875rem] text-destructive">
          {err}
        </p>
      ) : null}
    </div>
  );
}
