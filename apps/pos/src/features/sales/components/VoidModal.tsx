'use client';

import type { Sale, SaleStatus } from '@pos-tercos/types';
import {
  Button,
  Dialog,
  EmptyState,
  FormField,
  Input,
  LoadingSkeleton,
  Money,
  StatusBadge,
  cn,
  formatDate,
} from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { listSales } from '../api/list';
import { printComanda } from '../api/print';
import { notifyComandaFailed } from '../lib/comanda-events';
import { voidSale } from '../api/void';
import { notifyCajaChanged } from '../../shifts/lib/caja-events';
import { SALE_STATUS_MAPPING } from '../lib/sale-status-mapping';
import { getErrorMessage } from '../../../lib/errors';
import { logError } from '../../../lib/client-log';

const VOIDABLE_LIMIT = 50;
/** Solo se anula un pedido PAGADO que la cocina aún NO inició. */
const VOIDABLE: SaleStatus[] = ['PAGADO'];

export function VoidModal({
  open,
  shiftId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  shiftId: string | null;
  onClose: () => void;
  onSuccess: (sale: Sale) => void;
}) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setReason('');
    setPin('');
    setError(null);
    setPending(false);
    setLoading(true);
    listSales({ shiftId: shiftId ?? undefined, limit: VOIDABLE_LIMIT })
      .then((all) =>
        setSales(
          all
            .filter((s) => VOIDABLE.includes(s.status))
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            ),
        ),
      )
      .catch((err) => setError(getErrorMessage(err, 'Error cargando ventas')))
      .finally(() => setLoading(false));
  }, [open, shiftId]);

  const reasonValid = reason.trim().length >= 5 && reason.trim().length <= 200;
  const pinValid = /^\d{6}$/.test(pin);
  const canConfirm = selectedId !== null && reasonValid && pinValid && !pending;

  const handleConfirm = async () => {
    if (!canConfirm || !selectedId) return;
    setError(null);
    setPending(true);
    try {
      const voided = await voidSale(selectedId, { reason: reason.trim() }, pin);
      notifyCajaChanged();
      // #8: la cocina recibió la comanda al cobrar — avisarle con el ticket de
      // ANULACIÓN (número gigante) que descarte el pedido. Best-effort.
      void printComanda(voided.id, { cancel: true }).catch((e) => {
        logError('void.cancel-comanda', e, { saleId: voided.id });
        notifyComandaFailed({ saleId: voided.id, receiptNumber: voided.receiptNumber, kind: 'anulacion' });
      });
      onSuccess(voided);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido'));
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Anular venta"
      description="Selecciona la venta, registra el motivo, e ingresa el PIN del Admin/Dueño."
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!canConfirm}>
            {pending ? 'Anulando…' : 'Anular venta'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5 text-xs leading-relaxed text-warning">
          Solo se anula un pedido <strong>pagado que la cocina aún no inició</strong>.
          Al anular: pasa a <strong>ANULADA</strong>, se{' '}
          <strong>revierte el stock</strong>, <strong>sale de la caja</strong> y
          queda en auditoría. Requiere PIN de Admin/Dueño.
        </div>
        <FormField label={`Ventas anulables del turno (${sales.length})`}>
          {loading ? (
            <LoadingSkeleton shape="table-row" count={3} />
          ) : sales.length === 0 ? (
            <EmptyState title="No hay ventas anulables." size="sm" />
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              <ul className="divide-y divide-border">
                {sales.map((s) => (
                  <li key={s.id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors',
                        selectedId === s.id
                          ? 'bg-destructive/10 text-foreground'
                          : 'hover:bg-muted/40',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="sale"
                          checked={selectedId === s.id}
                          onChange={() => setSelectedId(s.id)}
                          className="h-4 w-4 accent-primary"
                        />
                        <span>
                          <span className="font-semibold">
                            {`Recibo #${s.receiptNumber}`}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            Recibo #{s.receiptNumber} ·{' '}
                            {formatDate(s.paidAt ?? s.createdAt, 'time-short')}
                            {s.paymentMethod ? ` · ${s.paymentMethod}` : ''}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={s.status} mapping={SALE_STATUS_MAPPING} />
                        <Money amount={s.total} weight="semibold" />
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </FormField>

        <FormField label="Motivo (5-200 caracteres)" hint={`${reason.trim().length}/200 · queda en audit log`}>
          <Input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. cliente devolvió por error en el pedido"
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
