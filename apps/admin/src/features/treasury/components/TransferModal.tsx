'use client';

import { POCKET_LABELS, PocketEnum, type Pocket } from '@pos-tercos/types';
import { Button, Dialog, FormField, MoneyInput, Select } from '@pos-tercos/ui';
import { ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';
import { createTransfer } from '../api/client';

const POCKETS = PocketEnum.options as Pocket[];

export function TransferModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [from, setFrom] = useState<Pocket>('EFECTIVO');
  const [to, setTo] = useState<Pocket>('CUENTA');
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const swap = (): void => {
    setFrom(to);
    setTo(from);
  };

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await createTransfer({
        fromPocket: from,
        toPocket: to,
        amount: Number(amount) || 0,
        reason: `Traspaso ${POCKET_LABELS[from]} → ${POCKET_LABELS[to]}`,
      });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el traspaso.');
    } finally {
      setPending(false);
    }
  };

  const valid = from !== to && Number(amount) > 0;

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title="Nuevo traspaso"
      description="Mové plata entre Efectivo y Cuenta. No cambia el total: solo la forma."
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={submit} disabled={pending || !valid}>{pending ? 'Guardando…' : 'Registrar'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <FormField label="Desde" required>
            <Select value={from} onChange={(e) => setFrom(e.target.value as Pocket)} disabled={pending}>
              {POCKETS.map((p) => (
                <option key={p} value={p}>{POCKET_LABELS[p]}</option>
              ))}
            </Select>
          </FormField>
          <button
            type="button"
            onClick={swap}
            disabled={pending}
            aria-label="Intercambiar origen y destino"
            title="Intercambiar"
            className="mt-7 flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <FormField label="Hacia" required error={from === to ? 'Debe ser distinto al origen' : undefined}>
            <Select value={to} onChange={(e) => setTo(e.target.value as Pocket)} disabled={pending}>
              {POCKETS.map((p) => (
                <option key={p} value={p}>{POCKET_LABELS[p]}</option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label="Monto" required>
          <MoneyInput value={amount} onChange={setAmount} disabled={pending} placeholder="0" />
        </FormField>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
    </Dialog>
  );
}
