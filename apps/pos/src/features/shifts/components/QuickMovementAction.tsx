'use client';

import type { Shift } from '@pos-tercos/types';
import { Button, Dialog, FormField, Input, NumberInput } from '@pos-tercos/ui';
import { ArrowDownUp } from 'lucide-react';
import { useState } from 'react';
import { addCashMovement } from '../api/cash-movements';

/**
 * Acción rápida del topbar: registrar una entrada/salida de efectivo del
 * cajón sin pasar por la pestaña Caja (ej. "pagué el pan $20.000",
 * "el dueño dejó $50.000 de base").
 */
export function QuickMovementAction({ shift }: { shift: Shift | null }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'IN' | 'OUT'>('OUT');
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (!shift) return null;

  const reset = () => {
    setType('OUT');
    setAmount(null);
    setReason('');
    setError(null);
    setOk(false);
  };

  const canSubmit = amount !== null && amount > 0 && reason.trim().length >= 3 && !pending;

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      await addCashMovement(shift.id, { type, amount: amount!, reason: reason.trim() });
      setOk(true);
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error registrando el movimiento');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        title="Registrar entrada/salida de efectivo"
      >
        <ArrowDownUp className="h-4 w-4" strokeWidth={2} aria-hidden />
        <span className="hidden xl:inline">Movimiento</span>
      </Button>

      <Dialog
        open={open}
        onClose={pending ? () => {} : () => setOpen(false)}
        title="Movimiento de caja"
        description="Entrada o salida de efectivo del cajón (aparte de las ventas)."
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {pending ? 'Guardando…' : ok ? 'Registrado ✓' : 'Registrar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: 'OUT', label: 'Salida (pago/gasto)' },
                { value: 'IN', label: 'Entrada' },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setType(o.value)}
                aria-pressed={type === o.value}
                className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  type === o.value
                    ? o.value === 'OUT'
                      ? 'border-destructive bg-destructive/10 text-destructive'
                      : 'border-success-border bg-success-bg text-success'
                    : 'border-border bg-card text-foreground hover:bg-muted/40'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <FormField label="Monto (COP)" required>
            <NumberInput
              value={amount}
              onChange={setAmount}
              prefix="$"
              grouping
              min={0}
              autoFocus
              disabled={pending}
              required
            />
          </FormField>
          <FormField label="Motivo" required>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='Ej. "Pago pan panadería La Espiga"'
              maxLength={200}
              disabled={pending}
            />
          </FormField>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
