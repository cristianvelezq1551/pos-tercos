'use client';

import { useEffect, useState } from 'react';
import { promotionStatus, type PromotionStatus } from '../lib/status';
import type { FormState } from './PromotionFormHelpers';

/**
 * Le dice al dueño, mientras la está creando, si esta promoción va a descontar
 * hoy — y si no, cuándo empieza.
 *
 * Nace de un caso real: se creó una promo un jueves, con vigencia desde ese
 * mismo jueves, pero con el jueves apagado en la máscara de días. El formulario
 * la aceptó sin decir nada, el pedido de prueba salió a precio lleno y la promo
 * llegó a verse "Activa" en la lista. No había una sola pista en pantalla.
 *
 * Se calcula con el reloj del navegador (el admin se sirve desde un servidor en
 * UTC, ver PromotionStatusBadge) y solo después de montar.
 */
export function PromotionWhenPreview({ state }: { state: FormState }) {
  const [status, setStatus] = useState<PromotionStatus | null>(null);

  useEffect(() => {
    setStatus(
      promotionStatus({
        isActive: true,
        daysOfWeekMask: state.daysMask,
        timeStart: `${state.timeStart}:00`,
        timeEnd: `${state.timeEnd}:00`,
        activeFrom: state.activeFrom || null,
        activeTo: state.activeTo || null,
      }),
    );
  }, [state.daysMask, state.timeStart, state.timeEnd, state.activeFrom, state.activeTo]);

  if (!status) return null;

  const ok = status.tone === 'success';
  return (
    <p
      className={`rounded-md border px-3 py-2 text-sm ${
        ok
          ? 'border-success/30 bg-success/10 text-foreground'
          : status.tone === 'danger'
            ? 'border-destructive/30 bg-destructive/10 text-foreground'
            : 'border-warning/40 bg-warning/10 text-foreground'
      }`}
    >
      <span className="font-semibold">
        {ok ? 'Con esta configuración, hoy sí descuenta.' : `Ojo: hoy no va a descontar.`}
      </span>{' '}
      {status.hint}
    </p>
  );
}
