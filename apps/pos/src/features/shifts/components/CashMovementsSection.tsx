'use client';

import {
  PAYMENT_METHOD_LABELS,
  type CashMovement,
  type CashMovementType,
  type PaymentMethod,
} from '@pos-tercos/types';
import { Button, Input, NumberInput, cn } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { FALLBACK_METHODS, fetchEnabledMethods } from '../../sales';
import {
  addCashMovement,
  deleteCashMovement,
  listCashMovements,
  updateCashMovement,
} from '../api';
import { notifyCajaChanged } from '../lib/caja-events';
import { CashMovementRow } from './CashMovementRow';

/**
 * Lista + registro de entradas/salidas del turno (aparte de ventas), con
 * MÉTODO: efectivo ajusta el cajón esperado; transferencia/digital ajusta
 * el arqueo digital de su método al cierre. Mientras la caja está abierta
 * un movimiento mal registrado se puede corregir o eliminar (queda en
 * bitácora); cerrada, el arqueo es inmutable.
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
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const resetForm = () => {
    setEditingId(null);
    setAmount(null);
    setReason('');
    setMethod('CASH');
    setType('OUT');
  };

  const startEdit = (m: CashMovement) => {
    setEditingId(m.id);
    setType(m.type);
    setMethod(m.method);
    setAmount(m.amount);
    setReason(m.reason);
    setError(null);
  };

  const submit = async () => {
    if (!valid || amount === null) return;
    setBusy(true);
    setError(null);
    try {
      const input = { type, method, amount, reason: reason.trim() };
      if (editingId) await updateCashMovement(shiftId, editingId, input);
      else await addCashMovement(shiftId, input);
      resetForm();
      await refresh();
      onChanged?.();
      notifyCajaChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error registrando el movimiento');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (movementId: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteCashMovement(shiftId, movementId);
      if (editingId === movementId) resetForm();
      await refresh();
      onChanged?.();
      notifyCajaChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminando el movimiento');
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
          {busy ? '…' : editingId ? 'Guardar' : 'Registrar'}
        </Button>
        {editingId ? (
          <Button variant="ghost" disabled={busy} onClick={resetForm}>
            Cancelar
          </Button>
        ) : null}
      </div>

      {editingId ? (
        <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
          Corrigiendo un movimiento — el cambio queda registrado en bitácora.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {movements.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {movements.map((m) => (
            <CashMovementRow
              key={m.id}
              movement={m}
              editing={editingId === m.id}
              busy={busy}
              onEdit={() => startEdit(m)}
              onDelete={() => remove(m.id)}
            />
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
