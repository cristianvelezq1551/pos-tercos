'use client';

import {
  PAYMENT_METHOD_LABELS,
  type CashMovement,
  type CashMovementType,
  type PaymentMethod,
} from '@pos-tercos/types';
import { Button, Input, Money, NumberInput, cn } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { FALLBACK_METHODS, fetchEnabledMethods } from '../../sales';
import { addCashMovement, listCashMovements } from '../api';

/**
 * Lista + registro de entradas/salidas del turno (aparte de ventas), con
 * MÉTODO: efectivo ajusta el cajón esperado; transferencia/digital ajusta
 * el arqueo digital de su método al cierre.
 */
export function CashMovementsSection({
  shiftId,
  onChanged,
}: {
  shiftId: string;
  onChanged?: () => void;
}) {
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [type, setType] = useState<CashMovementType>('OUT');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [methods, setMethods] = useState<readonly PaymentMethod[]>(FALLBACK_METHODS);
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMovements(await listCashMovements(shiftId));
    } catch {
      /* no rompemos la vista por esto */
    }
  }, [shiftId]);

  useEffect(() => {
    void refresh();
    void fetchEnabledMethods().then(setMethods);
  }, [refresh]);

  const valid = amount !== null && amount > 0 && reason.trim().length >= 3;

  const submit = async () => {
    if (!valid || amount === null) return;
    setBusy(true);
    setError(null);
    try {
      await addCashMovement(shiftId, { type, method, amount, reason: reason.trim() });
      setAmount(null);
      setReason('');
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error registrando el movimiento');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <p className="caps mb-2 text-[0.625rem] text-muted-foreground">
        Movimientos de caja · efectivo y transferencias
      </p>

      <div className="flex gap-1.5">
        <TypeButton active={type === 'OUT'} onClick={() => setType('OUT')} tone="danger">
          Salida
        </TypeButton>
        <TypeButton active={type === 'IN'} onClick={() => setType('IN')} tone="success">
          Entrada
        </TypeButton>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {methods.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            aria-pressed={method === m}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              method === m
                ? 'border-primary bg-destructive/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/40',
            )}
          >
            {PAYMENT_METHOD_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <NumberInput
          value={amount}
          onChange={setAmount}
          prefix="$"
          grouping
          min={0}
          placeholder="Monto"
          className="w-32 shrink-0"
        />
        <Input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={type === 'OUT' ? 'Motivo (ej. pago proveedor)' : 'Motivo (ej. fondo de cambio)'}
          maxLength={200}
          className="flex-1"
        />
        <Button variant="secondary" disabled={!valid || busy} onClick={() => void submit()}>
          {busy ? '…' : 'Registrar'}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {movements.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {movements.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">
                <span
                  className={cn(
                    'font-semibold',
                    m.type === 'IN' ? 'text-success' : 'text-destructive',
                  )}
                >
                  {m.type === 'IN' ? 'Entrada' : 'Salida'}
                </span>
                {m.method !== 'CASH' ? (
                  <span className="text-muted-foreground"> · {PAYMENT_METHOD_LABELS[m.method]}</span>
                ) : null}
                <span className="text-muted-foreground"> · {m.reason}</span>
              </span>
              <Money
                amount={m.type === 'IN' ? m.amount : -m.amount}
                size="xs"
                weight="semibold"
                withSign
                className="shrink-0"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Sin movimientos en este turno.</p>
      )}
    </section>
  );
}

function TypeButton({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: 'success' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
        active
          ? tone === 'success'
            ? 'bg-success/20 text-success'
            : 'bg-destructive/15 text-destructive'
          : 'bg-muted/40 text-muted-foreground hover:bg-ink-800',
      )}
    >
      {children}
    </button>
  );
}
