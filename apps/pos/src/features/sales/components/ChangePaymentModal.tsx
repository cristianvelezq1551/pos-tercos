'use client';

import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type Sale,
} from '@pos-tercos/types';
import { Button, Dialog, Money, cn } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { notifyCajaChanged } from '../../shifts/lib/caja-events';
import { changeSalePayment } from '../api/edit';
import { FALLBACK_METHODS, fetchEnabledMethods } from '../api/payment-methods';

/**
 * Re-registra el método de pago de una venta cobrada — para corregir un
 * registro equivocado (ej. quedó "Efectivo" pero pagaron por transferencia)
 * y que el arqueo cuadre. Solo mientras la caja del turno siga abierta;
 * el cambio queda en bitácora.
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
  const [methods, setMethods] = useState<readonly PaymentMethod[]>(FALLBACK_METHODS);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMethod(null);
    setError(null);
    setPending(false);
    void fetchEnabledMethods().then(setMethods);
  }, [open]);

  if (!sale) return null;

  const current =
    sale.paymentMethod !== null
      ? PAYMENT_METHOD_LABELS[sale.paymentMethod]
      : `Dividido (${(sale.payments ?? []).length} pagos)`;

  const handleConfirm = async () => {
    if (!method || pending) return;
    setPending(true);
    setError(null);
    try {
      await changeSalePayment(sale.id, { method });
      notifyCajaChanged();
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cambiando el pago');
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Cambiar método de pago"
      description={`${sale.turnNumber !== null ? `Turno ${sale.turnNumber}` : `Recibo #${sale.receiptNumber}`} · registrado como ${current}`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!method || pending}>
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

        <div>
          <p className="caps mb-1.5 text-[0.625rem] text-muted-foreground">
            Quedó registrado MAL — en realidad pagaron con:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                disabled={pending}
                onClick={() => setMethod(m)}
                aria-pressed={method === m}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                  method === m
                    ? 'border-primary bg-destructive/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/40',
                )}
              >
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[0.6875rem] text-muted-foreground">
          La plata ya entró — esto solo corrige el registro para que el arqueo
          cuadre. El cambio queda en la bitácora del dueño.
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
