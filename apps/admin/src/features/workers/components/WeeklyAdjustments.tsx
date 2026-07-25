'use client';

import type { PayrollAdjustment } from '@pos-tercos/types';
import { Button, Input, Money, MoneyInput, Select, cn } from '@pos-tercos/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addWeeklyAdjustment, deleteWeeklyAdjustment } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

/** Bonos / descuentos de la semana de un empleado (suman/restan al neto). */
export function WeeklyAdjustments({
  userId,
  weekStart,
  adjustments,
}: {
  userId: string;
  weekStart: string;
  adjustments: PayrollAdjustment[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sign, setSign] = useState<'+' | '-'>('+');
  const [concept, setConcept] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const magnitude = Number(amountInput) || 0;
    if (!concept.trim() || magnitude <= 0) {
      setError('Poné un concepto y un monto mayor a 0.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addWeeklyAdjustment({
        userId,
        weekStart,
        concept: concept.trim(),
        amount: sign === '+' ? magnitude : -magnitude,
      });
      setConcept('');
      setAmountInput('');
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo agregar.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    setBusy(true);
    try {
      await deleteWeeklyAdjustment(id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Bonos y descuentos</span>
        {!open ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)} disabled={busy}>
            + Agregar
          </Button>
        ) : null}
      </div>

      {adjustments.length > 0 ? (
        <ul className="mt-1 divide-y divide-border/60">
          {adjustments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">{a.concept}</span>
              <Money
                amount={a.amount}
                size="xs"
                weight="bold"
                className={cn(a.amount >= 0 ? 'text-success' : 'text-destructive')}
              />
              <button
                type="button"
                onClick={() => remove(a.id)}
                disabled={busy}
                aria-label="Quitar"
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <Select value={sign} onChange={(e) => setSign(e.target.value as '+' | '-')} disabled={busy} className="w-20">
              <option value="+">Bono</option>
              <option value="-">Descuento</option>
            </Select>
            <Input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Concepto (ej. horas extra, anticipo)"
              maxLength={120}
              disabled={busy}
              className="flex-1"
            />
            <MoneyInput value={amountInput} onChange={setAmountInput} disabled={busy} placeholder="0" />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button size="sm" onClick={submit} disabled={busy}>
              Guardar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
