'use client';

import type { Sale } from '@pos-tercos/types';
import { Button, Money, NumberInput } from '@pos-tercos/ui';
import { Bike, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { getErrorMessage } from '../../../lib/errors';
import { setDeliveryFee } from '../api';

/**
 * El cajero carga el costo del envío tras preguntarle la tarifa al domiciliario
 * por otro chat. El sistema NO la calcula.
 *
 * Al guardarlo, el total se recalcula y RECIÉN AHÍ le sale al cliente el
 * WhatsApp con el número real: pedirle plata antes de saber el envío sería
 * pedirle un total que va a cambiar.
 */
export function DeliveryFeeField({
  sale,
  onChanged,
}: {
  sale: Sale;
  onChanged: () => Promise<void> | void;
}) {
  const [fee, setFee] = useState<number | null>(sale.deliveryFee || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const assigned = sale.deliveryFee > 0;

  // §3.9: si OTRO dispositivo asigna/cambia el envío y la lista refresca, reflejar
  // el valor real en el input (antes solo se leía al montar → quedaba stale).
  // Solo cuando ya está asignado (> 0), para no pisar el tipeo del cajero mientras
  // aún no lo asignó nadie.
  useEffect(() => {
    if (sale.deliveryFee > 0) setFee(sale.deliveryFee);
  }, [sale.deliveryFee]);

  const save = async () => {
    if (fee === null) return;
    setBusy(true);
    setErr(null);
    try {
      await setDeliveryFee(sale.id, fee);
      await onChanged();
    } catch (e) {
      logError('web-orders.delivery-fee', e);
      setErr(getErrorMessage(e, 'No se pudo guardar'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/40 p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Bike className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        Costo del envío
      </p>

      <div className="mt-1.5 flex items-center gap-2">
        <NumberInput
          value={fee}
          onChange={setFee}
          grouping
          prefix="$"
          min={0}
          max={200000}
          className="h-8 w-28 text-sm"
          disabled={busy}
          aria-label="Costo del envío"
        />
        <Button size="sm" onClick={save} disabled={busy || fee === null}>
          {busy ? '…' : assigned ? 'Cambiar' : 'Asignar'}
        </Button>
        {assigned ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-success">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Avisado
          </span>
        ) : null}
      </div>

      {assigned ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Total a cobrar: <Money amount={sale.total} weight="bold" className="text-foreground" />{' '}
          (pedido + envío)
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-warning">
          Preguntale la tarifa al domiciliario. Al asignarla le llega al cliente el total real
          por WhatsApp.
        </p>
      )}

      {err ? <p className="mt-1 text-xs text-destructive">{err}</p> : null}
    </div>
  );
}
