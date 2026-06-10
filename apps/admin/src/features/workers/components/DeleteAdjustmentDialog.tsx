'use client';

import type { PayrollAdjustment } from '@pos-tercos/types';
import { Button, Dialog, PinField, formatCop, isValidPin } from '@pos-tercos/ui';
import { useState } from 'react';
import { deleteAdjustment } from '../api/client';

interface DeleteAdjustmentDialogProps {
  adjustment: Pick<PayrollAdjustment, 'id' | 'concept' | 'amount'>;
  onClose: () => void;
  onSuccess: () => void;
}

/** Quitar una novedad de un pago. Afecta el pago → requiere PIN del Dueño. */
export function DeleteAdjustmentDialog({ adjustment, onClose, onSuccess }: DeleteAdjustmentDialogProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await deleteAdjustment(adjustment.id, pin);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar la novedad.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Quitar novedad"
      description={`${adjustment.concept} · ${formatCop(adjustment.amount)}`}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending || !isValidPin(pin)}>
            {pending ? 'Quitando…' : 'Quitar con PIN'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Se quitará esta novedad del pago y cambiará el total. Queda registrado en bitácora.
        </p>
        <PinField value={pin} onChange={setPin} disabled={pending} />
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
