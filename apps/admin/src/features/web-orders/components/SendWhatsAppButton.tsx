'use client';

import type { WhatsAppNotificationStageCode } from '@pos-tercos/types';
import { Button, cn } from '@pos-tercos/ui';
import { Check, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { requestWhatsAppLink } from '../api/whatsapp';
import { logError } from '../../../lib/client-log';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Abre el chat del cliente con el mensaje ya escrito. El cajero revisa y toca
 * enviar desde SU WhatsApp — el sistema no manda nada por su cuenta
 * (decisión del dueño: el cliente responde en el hilo de siempre, y no hace
 * falta chip dedicado ni templates aprobados por Meta).
 *
 * ⚠️ La pestaña se abre ANTES del `await`. Un `window.open` después de una
 * espera lo bloquea el navegador por no venir de un gesto del usuario — misma
 * piedra que el pedido al proveedor (§7.v19). Por eso se abre en blanco y se le
 * pone la URL cuando llega.
 */
export function SendWhatsAppButton({
  saleId,
  stage,
  label,
  sent,
  onSent,
}: {
  saleId: string;
  stage: WhatsAppNotificationStageCode;
  label: string;
  /** Ya se avisó esta etapa → el botón pasa a "Reenviar" y no grita. */
  sent: boolean;
  onSent: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const click = () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const tab = window.open('', '_blank');

    void requestWhatsAppLink(saleId, stage, { force: sent })
      .then(async (link) => {
        if (tab) tab.location.href = link.url;
        // Sin pestaña (bloqueador de pop-ups) el aviso YA quedó registrado en el
        // server: hay que dar la salida a mano en vez de dejarlo marcado como
        // avisado sin que nadie haya escrito nada.
        else window.location.href = link.url;
        await onSent();
      })
      .catch((e: unknown) => {
        tab?.close();
        logError('web-orders.whatsapp', e);
        setErr(getErrorMessage(e, 'No se pudo abrir el chat'));
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="mt-2">
      <Button
        variant={sent ? 'outline' : 'success'}
        size="sm"
        className="w-full"
        disabled={busy}
        onClick={click}
      >
        <MessageCircle className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
        {busy ? 'Abriendo…' : sent ? `Reenviar: ${label}` : label}
      </Button>

      <p
        className={cn(
          'mt-1 flex items-center gap-1 text-[0.6875rem]',
          sent ? 'text-success' : 'text-warning',
        )}
      >
        {sent ? (
          <>
            <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} />
            Ya le avisaste por WhatsApp
          </>
        ) : (
          'El cliente todavía no sabe nada — avísale por WhatsApp'
        )}
      </p>

      {err ? (
        <p className="mt-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[0.6875rem] text-destructive">
          {err}
        </p>
      ) : null}
    </div>
  );
}
