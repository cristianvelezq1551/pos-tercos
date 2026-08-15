'use client';

import type { Sale } from '@pos-tercos/types';
import { Button, Money, StatusBadge, cn, formatDate } from '@pos-tercos/ui';
import { useState } from 'react';
import { SALE_STATUS_MAPPING } from '../../sales';
import { DeliveryAddress } from './DeliveryAddress';
import { DeliveryFeeField } from './DeliveryFeeField';
import { SendWhatsAppButton } from './SendWhatsAppButton';
import { whatsappStageFor } from '../lib/whatsapp-stage';
import { cancelWebOrder, markWebOrderDelivered, markWebOrderReady } from '../api';
import { getErrorMessage } from '../../../lib/errors';

function minutesSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

/** Color del tiempo: verde <7 min, ámbar 7-10, rojo >10. */
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
  const [err, setErr] = useState<string | null>(null);
  const prompt = whatsappStageFor(sale);

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

      <DeliveryAddress sale={sale} />

      {/* El envío se asigna ANTES de cobrar: después el monto ya se validó. */}
      {sale.type === 'WEB_DELIVERY' && sale.status === 'PENDIENTE_PAGO' ? (
        <DeliveryFeeField sale={sale} onChanged={onChanged} />
      ) : null}

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
          // Pagado → el cajero marca listo: avisa al cliente por WhatsApp
          // (pickup_ready). Un domicilio no se "retira" — el texto acompaña lo
          // que realmente pasa, y para el domicilio esto no es el final.
          <Button
            variant="success"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => run(() => markWebOrderReady(sale.id))}
          >
            {busy
              ? 'Marcando…'
              : sale.type === 'WEB_DELIVERY'
                ? 'Marcar despachado'
                : 'Marcar listo para retirar'}
          </Button>
        ) : sale.status === 'LISTO_DESPACHO' && sale.type === 'WEB_DELIVERY' ? (
          // El domicilio salió pero todavía no llegó. Sin este paso, "en la
          // moto" y "ya entregado" se ven igual para siempre.
          <Button
            variant="success"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => run(() => markWebOrderDelivered(sale.id))}
          >
            {busy ? 'Marcando…' : 'Marcar entregado'}
          </Button>
        ) : null}
      </div>

      {/* El aviso al cliente es MANUAL: nada sale solo. El botón sabe en qué
          punto está el pedido y qué corresponde decirle ahora. */}
      <div>
        {prompt ? (
          <SendWhatsAppButton
            saleId={sale.id}
            stage={prompt.stage}
            label={prompt.label}
            sent={prompt.sent}
            onSent={onChanged}
          />
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
