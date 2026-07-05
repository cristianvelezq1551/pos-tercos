'use client';

import type { Sale } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, Money } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { refundSale } from '../api/void';
import { notifyCajaChanged } from '../../shifts/lib/caja-events';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Reembolso de un pedido que la cocina YA inició (o ya se entregó). A
 * diferencia de anular: la comida ya se hizo → NO se devuelve stock; es una
 * pérdida. El pedido sale de los ingresos y del arqueo (la plata se le
 * devuelve al cliente). Requiere PIN de Admin/Dueño.
 */
export function RefundModal({
  sale,
  open,
  onClose,
  onRefunded,
}: {
  sale: Sale | null;
  open: boolean;
  onClose: () => void;
  onRefunded: () => void;
}) {
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setPin('');
    setError(null);
    setPending(false);
  }, [open, sale?.id]);

  const reasonValid = reason.trim().length >= 5 && reason.trim().length <= 200;
  const pinValid = /^\d{6}$/.test(pin);
  const canConfirm = sale !== null && reasonValid && pinValid && !pending;

  const handleConfirm = async () => {
    if (!canConfirm || !sale) return;
    setError(null);
    setPending(true);
    try {
      await refundSale(sale.id, { reason: reason.trim() }, pin);
      notifyCajaChanged();
      onRefunded();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido'));
      setPending(false);
    }
  };

  if (!sale) return null;

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title={`Reembolsar · ${`Recibo #${sale.receiptNumber}`}`}
      description="Devolución de un pedido que la cocina ya preparó."
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canConfirm}>
            {pending ? 'Reembolsando…' : 'Reembolsar'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5 text-xs leading-relaxed text-warning">
          La comida ya se preparó: el stock <strong>NO se devuelve</strong> (es
          una pérdida). El pedido sale de los ingresos y del arqueo —{' '}
          <strong>devolvé la plata al cliente</strong>. Queda en auditoría.
          Requiere PIN de Admin/Dueño.
        </div>

        <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Monto a devolver</span>
          <Money amount={sale.total} weight="semibold" />
        </div>

        <FormField label="Motivo (5-200 caracteres)" hint={`${reason.trim().length}/200 · queda en audit log`}>
          <Input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. el pedido salió mal y el cliente pidió devolución"
            maxLength={200}
          />
        </FormField>

        <FormField label="PIN del Admin/Dueño (6 dígitos)">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            maxLength={6}
            className="font-mono tracking-[0.4em]"
          />
        </FormField>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
