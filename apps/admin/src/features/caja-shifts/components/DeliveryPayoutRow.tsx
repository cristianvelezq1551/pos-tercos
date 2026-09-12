'use client';

import { Money, cn } from '@pos-tercos/ui';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { DeliveryPayout } from '../lib/delivery-payouts';

/**
 * Fila de un domicilio pagado del cajón. Quitarlo pide confirmación en dos
 * toques, igual que un movimiento suelto: deshace las dos patas y su traspaso.
 */
export function DeliveryPayoutRow({
  payout,
  busy,
  onDelete,
}: {
  payout: DeliveryPayout;
  busy: boolean;
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold text-destructive">Salió del cajón</span>
        <span className="text-muted-foreground"> · entró a la cuenta</span>
        {payout.note ? <span className="text-muted-foreground"> · {payout.note}</span> : null}
      </span>
      <Money amount={payout.amount} size="xs" weight="semibold" />
      <button
        type="button"
        onClick={() => (confirming ? void onDelete() : setConfirming(true))}
        onBlur={() => setConfirming(false)}
        disabled={busy}
        aria-label={confirming ? 'Confirmar que se quita el domicilio' : 'Quitar el domicilio'}
        className={cn(
          'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-2 transition-colors',
          confirming
            ? 'bg-destructive/15 text-destructive'
            : 'text-muted-foreground hover:bg-muted hover:text-destructive',
        )}
      >
        {confirming ? <span className="text-[0.6875rem] font-semibold">Quitar</span> : <Trash2 className="size-3.5" />}
      </button>
    </li>
  );
}
