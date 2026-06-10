'use client';

import { Button, Dialog, PinField, isValidPin } from '@pos-tercos/ui';
import { useState } from 'react';
import { unmarkPayment } from '../api/client';

export function UnmarkDialog({
  userId,
  periodStart,
  workerName,
  prevStatus,
  onClose,
  onSuccess,
}: {
  userId: string;
  periodStart: string;
  workerName: string;
  prevStatus: 'PAID' | 'CANCELLED';
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await unmarkPayment(userId, periodStart, pin);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desmarcar.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title="Desmarcar pago"
      description={`${workerName} · este registro y su comprobante se eliminarán.`}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Volver
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!isValidPin(pin) || pending}>
            {pending ? 'Desmarcando…' : 'Confirmar con PIN'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-md border border-warning-border bg-warning-bg/40 px-3 py-2 text-xs text-warning">
          Estaba marcado como <strong>{prevStatus === 'PAID' ? 'PAGADO' : 'CANCELADO'}</strong>. Al
          desmarcar, se borra el registro
          {prevStatus === 'PAID' ? ' y el comprobante' : ''}. Queda en la bitácora.
        </p>
        <PinField value={pin} onChange={setPin} disabled={pending} />
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
