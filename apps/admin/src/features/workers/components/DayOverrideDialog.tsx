'use client';

import { Button, Dialog, FormField, Input, MoneyInput, formatCop } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deletePayrollDay, setPayrollDay } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

/** Edita el valor de UN día de un trabajador DIARIO: llegada tarde (monto
 *  menor), ausencia ($0) o un monto distinto. El valor por defecto es el
 *  valor/día; quitar la excepción lo restaura. */
export function DayOverrideDialog({
  userId,
  workerName,
  date,
  defaultAmount,
  currentAmount,
  hasOverride,
  onClose,
}: {
  userId: string;
  workerName: string;
  date: string;
  /** Valor/día por defecto del trabajador. */
  defaultAmount: number;
  /** Monto actual del día (override si existe, si no el default). */
  currentAmount: number;
  hasOverride: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [amountInput, setAmountInput] = useState(String(Math.round(currentAmount)));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const amount = Math.max(0, Math.round((Number(amountInput) || 0) * 100) / 100);
  const valid = amountInput.trim() !== '';

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await fn();
      router.refresh();
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar.'));
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={pending ? () => {} : onClose}
      title={`Editar día · ${date}`}
      description={`${workerName} · valor/día ${formatCop(defaultAmount)}. Poné $0 para una ausencia o un monto menor por llegada tarde.`}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          {hasOverride ? (
            <Button variant="ghost" onClick={() => run(() => deletePayrollDay(userId, date))} disabled={pending}>
              Quitar excepción
            </Button>
          ) : null}
          <Button onClick={() => run(() => setPayrollDay(userId, { workDate: date, amount, note: note.trim() || undefined }))} disabled={pending || !valid}>
            {pending ? 'Guardando…' : `Guardar ${formatCop(amount)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Monto del día" hint="0 = ausencia (no vino)." required>
          <div className="flex flex-wrap gap-2">
            <MoneyInput value={amountInput} onChange={setAmountInput} disabled={pending} />
            <Button type="button" size="sm" variant="outline" onClick={() => setAmountInput('0')} disabled={pending}>
              Ausencia ($0)
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setAmountInput(String(Math.round(defaultAmount)))} disabled={pending}>
              Día completo
            </Button>
          </div>
        </FormField>

        <FormField label="Motivo" hint="Opcional (ej. llegó tarde, permiso)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} maxLength={300} />
        </FormField>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
