'use client';

import type { PayrollWeekPayment } from '@pos-tercos/types';
import { Button, Dialog, FormField, PinField, formatCop, isValidPin } from '@pos-tercos/ui';
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
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await voidWeekPayment(payment.id, pin);
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
          <Button variant="destructive" onClick={submit} disabled={pending || !isValidPin(pin)}>
            {pending ? 'Anulando…' : 'Anular abono'}
          </Button>
        </>
      }
    >
      <FormField label="PIN de aprobación (Dueño)" required>
        <PinField value={pin} onChange={setPin} disabled={pending} />
      </FormField>
      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
