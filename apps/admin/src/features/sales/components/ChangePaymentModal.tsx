'use client';

import {
  MAX_SPLIT_PARTS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethodSetting,
  type Sale,
} from '@pos-tercos/types';
import { Button, Dialog, Money, cn } from '@pos-tercos/ui';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { notifyCajaChanged } from '../../caja-shifts/lib/caja-events';
import { changeSalePayment } from '../api/edit';
import { FALLBACK_METHODS, fetchEnabledMethods } from '../api/payment-methods';
import { PaymentPartRow, type Part } from './PaymentPartRow';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Re-registra el pago de una venta cobrada — método único O la división
 * completa (cada parte con su método y monto, suma exacta al total). Para
 * corregir registros equivocados y que el arqueo cuadre. Solo con la caja
 * abierta; el cambio queda en bitácora.
 */
export function ChangePaymentModal({
  sale,
  open,
  onClose,
  onSaved,
}: {
  sale: Sale | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [methods, setMethods] = useState<readonly PaymentMethodSetting[]>(FALLBACK_METHODS);
  const [parts, setParts] = useState<Part[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open || !sale) return;
    setError(null);
    setPending(false);
    // Arranca con la división ACTUAL de la venta (1 parte si fue pago único).
    const current = sale.payments ?? [];
    setParts(
      current.length > 0
        ? current.map((p) => ({ method: p.method, amount: p.amount }))
        : [{ method: sale.paymentMethod ?? 'CASH', amount: sale.total }],
    );
    void fetchEnabledMethods().then(setMethods);
  }, [open, sale?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sale) return null;

  const assigned = parts.reduce((a, p) => a + (p.amount ?? 0), 0);
  const remaining = sale.total - assigned;
  const valid =
    parts.length > 0 &&
    parts.every((p) => p.amount !== null && p.amount > 0) &&
    Math.abs(remaining) < 0.005;

  const setPart = (i: number, patch: Partial<Part>) =>
    setParts((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const addPart = () => {
    if (parts.length >= MAX_SPLIT_PARTS) return;
    // La parte nueva arranca con lo que falta por asignar.
    setParts((prev) => [
      ...prev,
      { method: 'CASH', amount: remaining > 0 ? remaining : null },
    ]);
  };

  const handleConfirm = async () => {
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    try {
      const payload =
        parts.length === 1
          ? { method: parts[0]!.method }
          : { payments: parts.map((p) => ({ method: p.method, amount: p.amount! })) };
      await changeSalePayment(sale.id, payload);
      notifyCajaChanged();
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Error cambiando el pago'));
      setPending(false);
    }
  };

  const current =
    sale.paymentMethod !== null
      ? PAYMENT_METHOD_LABELS[sale.paymentMethod]
      : `Dividido (${(sale.payments ?? []).length} pagos)`;

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Cambiar pago"
      description={`${`Recibo #${sale.receiptNumber}`} · registrado como ${current}`}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!valid || pending}>
            {pending ? 'Guardando…' : 'Cambiar pago'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Total de la venta</span>
          <Money amount={sale.total} weight="semibold" />
        </div>

        <div className="space-y-2">
          <p className="caps text-[0.625rem] text-muted-foreground">
            Cómo pagaron en realidad — {parts.length === 1 ? 'pago único' : `${parts.length} partes`}:
          </p>
          {parts.map((part, i) => (
            <PaymentPartRow
              key={i}
              part={part}
              index={i}
              methods={methods}
              pending={pending}
              single={parts.length === 1}
              onMethodChange={(m) => setPart(i, { method: m })}
              onAmountChange={(v) => setPart(i, { amount: v })}
              onRemove={() =>
                setParts((prev) => {
                  const next = prev.filter((_, j) => j !== i);
                  // Si queda una sola parte, cubre el total completo.
                  return next.length === 1
                    ? [{ ...next[0]!, amount: sale.total }]
                    : next;
                })
              }
            />
          ))}

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || parts.length >= MAX_SPLIT_PARTS}
              onClick={addPart}
            >
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Agregar parte
            </Button>
            {parts.length > 1 && Math.abs(remaining) >= 0.005 ? (
              <span
                className={cn(
                  'text-xs font-semibold tabular-nums',
                  remaining > 0 ? 'text-warning' : 'text-destructive',
                )}
              >
                {remaining > 0 ? 'Faltan' : 'Sobran'}{' '}
                <Money amount={Math.abs(remaining)} size="xs" className="text-current" />
              </span>
            ) : parts.length > 1 ? (
              <span className="text-xs font-semibold text-success">Suma exacta ✓</span>
            ) : null}
          </div>
        </div>

        <p className="text-[0.6875rem] text-muted-foreground">
          La plata ya entró — esto solo corrige el registro (método o división)
          para que el arqueo cuadre. El cambio queda en la bitácora del dueño.
        </p>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
