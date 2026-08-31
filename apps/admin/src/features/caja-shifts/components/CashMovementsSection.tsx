'use client';

import type {
  CashMovement,
  CashMovementType,
  PaymentMethod,
  PaymentMethodSetting,
} from '@pos-tercos/types';
import { useCallback, useEffect, useState } from 'react';
import { FALLBACK_METHODS, fetchEnabledMethods } from '../../sales';
import { addCashMovement, deleteCashMovement, listCashMovements, updateCashMovement } from '../api';
import { notifyCajaChanged } from '../../../lib/caja-events';
import { CashMovementForm } from './CashMovementForm';
import { CashMovementRow } from './CashMovementRow';
import { getErrorMessage } from '../../../lib/errors';

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
  const [methods, setMethods] = useState<readonly PaymentMethodSetting[]>(FALLBACK_METHODS);
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
      setError(getErrorMessage(e, 'Error registrando el movimiento'));
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
      setError(getErrorMessage(e, 'Error eliminando el movimiento'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <p className="caps mb-2 text-[0.625rem] text-muted-foreground">
        Movimientos de caja · efectivo y transferencias
      </p>

      <CashMovementForm
        type={type}
        onTypeChange={setType}
        method={method}
        onMethodChange={setMethod}
        methods={methods}
        amount={amount}
        onAmountChange={setAmount}
        reason={reason}
        onReasonChange={setReason}
        valid={valid}
        busy={busy}
        editing={editingId !== null}
        onSubmit={submit}
        onCancel={resetForm}
      />

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
