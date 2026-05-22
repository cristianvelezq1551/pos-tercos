'use client';

import type { Sale } from '@pos-tercos/types';
import {
  Button,
  Dialog,
  EmptyState,
  FormField,
  Input,
  LoadingSkeleton,
  Money,
  cn,
  formatDate,
} from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { listSales } from '../api/list';
import { voidSale } from '../api/void';

const VOIDABLE_LIMIT = 20;

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
    listSales({ shiftId: shiftId ?? undefined, status: 'PAGADO', limit: VOIDABLE_LIMIT })
      .then(setSales)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando ventas'))
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
      onSuccess(voided);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
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
          Al anular: la venta pasa a <strong>ANULADA</strong>, se{' '}
          <strong>revierte el stock</strong> y queda registrada en auditoría. Solo
          se permite si la cocina <strong>aún no inició</strong> la preparación
          (PENDIENTE_PAGO o PAGADO sin iniciar). Requiere PIN de Admin/Dueño.
        </div>
        <FormField label={`Ventas pagadas del turno actual (${sales.length})`}>
          {loading ? (
            <LoadingSkeleton shape="table-row" count={3} />
          ) : sales.length === 0 ? (
            <EmptyState title="No hay ventas pagadas para anular." size="sm" />
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
                          <span className="font-semibold">#{s.receiptNumber}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {s.paidAt ? formatDate(s.paidAt, 'time-short') : '—'}{' '}
                            · {s.paymentMethod}
                          </span>
                        </span>
                      </span>
                      <Money amount={s.total} weight="semibold" />
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
