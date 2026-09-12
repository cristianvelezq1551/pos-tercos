'use client';

import type { CashMovement } from '@pos-tercos/types';
import { Button, Input, Money, NumberInput } from '@pos-tercos/ui';
import { Bike } from 'lucide-react';
import { useState } from 'react';
import { addDeliveryPayout, deleteDeliveryPayout } from '../api';
import { agruparDomicilios } from '../lib/delivery-payouts';
import { notifyCajaChanged } from '../../../lib/caja-events';
import { getErrorMessage } from '../../../lib/errors';
import { DeliveryPayoutRow } from './DeliveryPayoutRow';

/**
 * Domicilios que el cliente pagó por transferencia y el cajero pagó en efectivo
 * del cajón (§7.v71).
 *
 * Registrarlo NO toca la venta: la comida ya quedó registrada aparte. Lo que
 * corrige son las dos puntas que ese movimiento de plata desacomoda —el cajón
 * queda corto y la cuenta sobrada— más el traspaso de tesorería.
 *
 * Cuando el cliente paga TODO en efectivo no hay nada que registrar acá.
 */
export function DeliveryPayoutsSection({
  shiftId,
  movements,
  onChanged,
}: {
  shiftId: string;
  movements: readonly CashMovement[];
  onChanged: () => void;
}) {
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const domicilios = agruparDomicilios(movements);
  const total = domicilios.reduce((acc, d) => acc + d.amount, 0);
  const notaValida = note.trim().length === 0 || note.trim().length >= 3;
  const valid = amount !== null && amount > 0 && notaValida;

  const registrar = async (): Promise<void> => {
    if (!valid || amount === null) return;
    setBusy(true);
    setError(null);
    try {
      const limpia = note.trim();
      await addDeliveryPayout(shiftId, {
        amount,
        ...(limpia.length >= 3 ? { note: limpia } : {}),
      });
      setAmount(null);
      setNote('');
      onChanged();
      notifyCajaChanged();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo registrar el domicilio'));
    } finally {
      setBusy(false);
    }
  };

  const quitar = async (pairId: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await deleteDeliveryPayout(shiftId, pairId);
      onChanged();
      notifyCajaChanged();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo quitar el domicilio'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Domicilios pagados del cajón" className="rounded-xl border border-border bg-card p-3">
      <p className="caps mb-1 flex items-center gap-1.5 text-[0.625rem] text-muted-foreground">
        <Bike className="size-3.5" aria-hidden />
        Domicilios pagados del cajón
      </p>
      <p className="mb-2 text-[0.6875rem] leading-snug text-muted-foreground">
        Cuando el cliente transfiere la comida y el domicilio juntos, y al domiciliario le pagas en
        efectivo del cajón. Registra solo lo del domicilio: el cajón deja de esperar esa plata y la
        cuenta sí la espera. Si el cliente pagó todo en efectivo, no registres nada.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-32 flex-1">
          <NumberInput
            aria-label="Valor del domicilio"
            placeholder="Valor del domicilio"
            value={amount}
            onChange={setAmount}
            disabled={busy}
            prefix="$"
          />
        </div>
        <div className="min-w-40 flex-1">
          <Input
            aria-label="Referencia (opcional)"
            placeholder="Referencia (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            maxLength={120}
          />
        </div>
        <Button onClick={registrar} disabled={!valid || busy}>
          {busy ? 'Guardando…' : 'Registrar'}
        </Button>
      </div>
      {!notaValida ? (
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
          La referencia necesita al menos 3 letras, o déjala vacía.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {domicilios.length > 0 ? (
        <>
          <ul className="mt-3 space-y-1.5">
            {domicilios.map((d) => (
              <DeliveryPayoutRow
                key={d.pairId}
                payout={d}
                busy={busy}
                onDelete={() => quitar(d.pairId)}
              />
            ))}
          </ul>
          <p className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {domicilios.length === 1
                ? '1 domicilio pagado del cajón'
                : `${domicilios.length} domicilios pagados del cajón`}
            </span>
            <Money amount={total} size="xs" weight="semibold" className="text-current" />
          </p>
        </>
      ) : null}
    </section>
  );
}
