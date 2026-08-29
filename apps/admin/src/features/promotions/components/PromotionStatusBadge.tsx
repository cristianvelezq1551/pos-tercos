'use client';

import { Badge } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { promotionStatus, type PromotionStatus, type PromotionStatusInput } from '../lib/status';

/**
 * El estado real se calcula con el reloj del NAVEGADOR, no con el del render.
 *
 * El admin se sirve desde Vercel, que corre en UTC: a las 8 de la noche de
 * Bogotá el servidor ya está en el día siguiente y diría un día de la semana
 * distinto al que ve la persona. Por eso se resuelve después de montar, y hasta
 * entonces se muestra lo único que no depende de la hora: si está encendida.
 */
export function usePromotionStatus(promotion: PromotionStatusInput): PromotionStatus | null {
  const [status, setStatus] = useState<PromotionStatus | null>(null);
  useEffect(() => {
    setStatus(promotionStatus(promotion));
    // Un turno largo con la pestaña abierta cruza el borde de la franja: se
    // revisa cada minuto para que el cartel no quede mintiendo.
    const id = setInterval(() => setStatus(promotionStatus(promotion)), 60_000);
    return () => clearInterval(id);
  }, [promotion]);
  return status;
}

export function PromotionStatusBadge({ promotion }: { promotion: PromotionStatusInput }) {
  const status = usePromotionStatus(promotion);
  if (!status) {
    return (
      <Badge tone={promotion.isActive ? 'success' : 'neutral'} size="sm">
        {promotion.isActive ? 'Encendida' : 'Apagada'}
      </Badge>
    );
  }
  return (
    <Badge tone={status.tone} size="sm">
      {status.label}
    </Badge>
  );
}
