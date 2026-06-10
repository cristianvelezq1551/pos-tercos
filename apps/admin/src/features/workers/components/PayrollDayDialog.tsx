'use client';

import type { PanelDay } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, MoneyInput, PinField, formatCop, isValidPin } from '@pos-tercos/ui';
import { useState } from 'react';
import { deletePayrollDay, setPayrollDay } from '../api/client';

type Choice = 'default' | 'absence' | 'custom';

interface PayrollDayDialogProps {
  userId: string;
  /** Valor por defecto del día (salario diario del empleado). */
  defaultAmount: number;
  /** Día que se edita (ya calculado: por defecto u override). */
  day: PanelDay;
  onClose: () => void;
  onSuccess: () => void;
}

const fmtFull = (ymd: string): string =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

/** Edita la EXCEPCIÓN de un día: por defecto (sin excepción), no asistió, u otro monto. */
export function PayrollDayDialog({ userId, defaultAmount, day, onClose, onSuccess }: PayrollDayDialogProps) {
  const initial: Choice = day.isDefault ? 'default' : day.isAbsence ? 'absence' : 'custom';
  const [choice, setChoice] = useState<Choice>(initial);
  const [amount, setAmount] = useState(String(day.isDefault ? defaultAmount : day.amount));
  const [note, setNote] = useState(day.note ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // "Trabajó normal" sin excepción previa = no cambia nada → no exige PIN.
  const willMutate = choice === 'default' ? Boolean(day.overrideId) : true;

  const submit = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      if (choice === 'default') {
        if (day.overrideId) await deletePayrollDay(userId, day.workDate, pin);
      } else {
        const value = choice === 'absence' ? 0 : Number(amount);
        await setPayrollDay(userId, { workDate: day.workDate, amount: value, note: note.trim() || undefined }, pin);
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el día.');
    } finally {
      setPending(false);
    }
  };

  const OPTIONS: Array<{ value: Choice; title: string; hint: string }> = [
    { value: 'default', title: 'Trabajó normal', hint: `Paga el valor por defecto (${formatCop(defaultAmount)})` },
    { value: 'absence', title: 'No asistió', hint: 'No se paga este día (0)' },
    { value: 'custom', title: 'Otro monto', hint: 'Trabajó extra / medio día' },
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      title="Editar día"
      description={fmtFull(day.workDate)}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={pending || (choice === 'custom' && !amount) || (willMutate && !isValidPin(pin))}
          >
            {pending ? 'Guardando…' : willMutate ? 'Guardar con PIN' : 'Listo'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {day.isFuture ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Día pendiente: aún no suma al total. Lo que registres aplicará cuando llegue la fecha.
          </p>
        ) : null}

        <div className="grid gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setChoice(o.value)}
              disabled={pending}
              className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition ${
                choice === o.value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <span className="text-sm font-medium text-foreground">{o.title}</span>
              <span className="text-xs text-muted-foreground">{o.hint}</span>
            </button>
          ))}
        </div>

        {choice === 'custom' ? (
          <FormField label="Monto del día">
            <MoneyInput value={amount} onChange={setAmount} disabled={pending} placeholder="0" />
          </FormField>
        ) : null}

        {choice !== 'default' ? (
          <FormField label="Nota" hint="Opcional (ej. horas extra, medio día, enfermo)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />
          </FormField>
        ) : null}

        {willMutate ? <PinField value={pin} onChange={setPin} disabled={pending} /> : null}

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
