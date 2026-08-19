'use client';

import { POCKET_LABELS, PocketEnum, type Pocket } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, MoneyInput, Select } from '@pos-tercos/ui';
import { useState } from 'react';
import { createAdjustment } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

const POCKETS = PocketEnum.options as Pocket[];

export function AdjustmentModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [pocket, setPocket] = useState<Pocket>('EFECTIVO');
  const [direction, setDirection] = useState<'add' | 'subtract'>('subtract');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      const magnitude = Number(amount) || 0;
      const signed = direction === 'add' ? magnitude : -magnitude;
      await createAdjustment({ pocket, amount: signed, reason: reason.trim() });
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo registrar el ajuste.'));
    } finally {
      setPending(false);
    }
  };

  const valid = Number(amount) > 0 && reason.trim().length >= 3;

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title="Nuevo ajuste"
      description="Corrige el saldo de un bolsillo a mano (suma o resta) cuando el sistema no captura el movimiento."
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || !valid}>{pending ? 'Guardando…' : 'Registrar'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Bolsillo" required>
            <Select value={pocket} onChange={(e) => setPocket(e.target.value as Pocket)} disabled={pending}>
              {POCKETS.map((p) => (
                <option key={p} value={p}>{POCKET_LABELS[p]}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Tipo" required>
            <Select value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'subtract')} disabled={pending}>
              <option value="subtract">Restar (−)</option>
              <option value="add">Sumar (+)</option>
            </Select>
          </FormField>
        </div>
        <FormField label="Monto" required>
          <MoneyInput value={amount} onChange={setAmount} disabled={pending} placeholder="0" />
        </FormField>
        <FormField label="Motivo" required hint="Ej: faltante, retiro del dueño, corrección">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} maxLength={200} />
        </FormField>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
    </Dialog>
  );
}
