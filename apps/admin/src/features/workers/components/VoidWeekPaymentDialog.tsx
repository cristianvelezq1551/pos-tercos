'use client';

import type { PayrollWeekPayment } from '@pos-tercos/types';
import { Button, Dialog, formatCop } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { voidWeekPayment } from '../api/client';

export function VoidWeekPaymentDialog({
  payment,
  onClose,
}: {
  payment: PayrollWeekPayment;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await voidWeekPayment(payment.id);
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular el abono.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title="Anular abono"
      description={`Se anula el abono de ${formatCop(payment.amount)}. Si fue en efectivo, se reversa el egreso de la caja abierta.`}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            {pending ? 'Anulando…' : 'Anular abono'}
          </Button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
