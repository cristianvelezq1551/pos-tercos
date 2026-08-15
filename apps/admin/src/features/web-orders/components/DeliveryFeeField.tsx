'use client';

import type { Sale } from '@pos-tercos/types';
import { Button, Money, NumberInput } from '@pos-tercos/ui';
import { Bike, Check, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { getErrorMessage } from '../../../lib/errors';
import { setDeliveryFee } from '../api';
import { requestWhatsAppLink } from '../api/whatsapp';

/**
 * El cajero carga el costo del envío tras preguntarle la tarifa al domiciliario
 * por otro chat. El sistema NO la calcula.
 *
 * Cargar el envío y avisarle al cliente son UNA sola acción, no dos botones:
 * un envío asignado que nadie comunicó deja al cliente esperando un total que
 * nunca le llega, y separarlo hacía que ese fuera el estado por defecto.
 * Al guardar, el total se recalcula y se abre el chat con el mensaje escrito.
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
  const avisado = sale.notified?.paymentInstructions ?? false;

  // §3.9: si OTRO dispositivo asigna/cambia el envío y la lista refresca, reflejar
  // el valor real en el input (antes solo se leía al montar → quedaba stale).
  // Solo cuando ya está asignado (> 0), para no pisar el tipeo del cajero mientras
  // aún no lo asignó nadie.
  useEffect(() => {
    if (sale.deliveryFee > 0) setFee(sale.deliveryFee);
  }, [sale.deliveryFee]);

  const saveAndSend = () => {
    if (fee === null || busy) return;
    setBusy(true);
    setErr(null);

    // La pestaña se abre ANTES de cualquier espera: un `window.open` después de
    // un await lo bloquea el navegador por no venir de un gesto del usuario.
    const tab = window.open('', '_blank');

    void (async () => {
      // Los dos pasos fallan distinto: si el envío NO se guardó, el error es
      // "no se guardó"; si se guardó pero el chat no abrió, decir "no se pudo
      // guardar" sería falso y la tarjeta quedaría desincronizada del fee real.
      let saved = false;
      try {
        await setDeliveryFee(sale.id, fee);
        saved = true;
        // `force`: si ya se le había avisado, el total cambió y hay que
        // decírselo de nuevo — tiene un número viejo en la mano.
        const link = await requestWhatsAppLink(sale.id, 'payment_instructions', {
          force: avisado,
        });
        if (tab) tab.location.href = link.url;
        else window.location.href = link.url;
      } catch (e) {
        tab?.close();
        logError('web-orders.delivery-fee', e);
        setErr(
          saved
            ? getErrorMessage(
                e,
                'El envío quedó guardado, pero no se pudo abrir WhatsApp. Avísale al cliente con el botón de WhatsApp del pedido.',
              )
            : getErrorMessage(e, 'No se pudo guardar el envío'),
        );
      } finally {
        if (saved) {
          // El fee SÍ cambió: refrescar la tarjeta aunque el chat no abriera.
          try {
            await onChanged();
          } catch {
            // el refresco es best-effort
          }
        }
        setBusy(false);
      }
    })();
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
        <Button
          size="sm"
          variant="success"
          className="flex-1"
          onClick={saveAndSend}
          disabled={busy || fee === null}
        >
          <MessageCircle className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
          {busy ? 'Abriendo…' : assigned ? 'Cambiar y reenviar' : 'Cobrar por WhatsApp'}
        </Button>
      </div>

      {assigned ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Total a cobrar: <Money amount={sale.total} weight="bold" className="text-foreground" />{' '}
          (pedido + envío)
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-warning">
          Pregúntale la tarifa al domiciliario. Al cargarla se abre el chat con el total.
        </p>
      )}

      {avisado ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-success">
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
          Ya le enviaste el total por WhatsApp
        </p>
      ) : null}

      {err ? <p className="mt-1 text-xs text-destructive">{err}</p> : null}
    </div>
  );
}
