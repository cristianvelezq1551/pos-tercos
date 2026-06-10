'use client';

import type { ManagedUser } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, PinField, isValidPin } from '@pos-tercos/ui';
import { useState } from 'react';
import { terminateEmployment } from '../api/client';

interface TerminateDialogProps {
  user: Pick<ManagedUser, 'id' | 'fullName'>;
  onClose: () => void;
  onSuccess: (u: ManagedUser) => void;
}

/** Fecha local de hoy YYYY-MM-DD (no UTC, que de noche en Colombia adelanta un día). */
function todayLocalYmd(): string {
  const n = new Date();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${n.getFullYear()}-${m}-${d}`;
}

/** Termina el empleo: liquida hasta la fecha e INACTIVA el usuario. */
export function TerminateDialog({ user, onClose, onSuccess }: TerminateDialogProps) {
  const [date, setDate] = useState(todayLocalYmd());
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      const updated = await terminateEmployment(user.id, { date, note: note.trim() || undefined }, pin);
      onSuccess(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo terminar el empleo.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Terminar empleo"
      description={`${user.fullName} quedará INACTIVO y se liquida la nómina hasta la fecha de salida.`}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending || !isValidPin(pin)}>
            {pending ? 'Procesando…' : 'Terminar empleo con PIN'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Fecha de salida" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} />
        </FormField>
        <FormField label="Motivo / nota" hint="Opcional">
          <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
        <p className="rounded-md border border-warning-border bg-warning-bg/30 px-3 py-2 text-xs text-warning">
          El usuario no podrá iniciar sesión y dejará de aparecer en pagos posteriores a la fecha
          de salida. El pago de salida se prorratea por los días trabajados.
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
