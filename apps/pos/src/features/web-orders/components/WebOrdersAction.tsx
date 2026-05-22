'use client';

import type { PublicWebOrder } from '@pos-tercos/types';
import { Button, cn } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { useWebOrdersSocket } from '../hooks/useWebOrdersSocket';
import { WebOrdersModal } from './WebOrdersModal';

/**
 * Topbar action: badge con contador en vivo + botón que abre el drawer.
 * Mantiene UNA conexión WS al gateway (subscribe events). El drawer
 * abre/cierra UI, pero la conexión persiste en este wrapper.
 */
export function WebOrdersAction({
  initial,
  wsToken,
}: {
  initial: PublicWebOrder[];
  wsToken: string | null;
}) {
  const [open, setOpen] = useState(false);
  // El hook (WS) alimenta el badge contador + el pulse de "nuevo pedido".
  // El contenido del modal lo maneja el propio modal vía REST (más resiliente).
  const { orders } = useWebOrdersSocket(initial, wsToken);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (orders.length === 0) return;
    setPulse(true);
    const id = setTimeout(() => setPulse(false), 1500);
    return () => clearTimeout(id);
  }, [orders.length]);

  const total = orders.length;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn('relative', pulse && 'motion-safe:animate-pulse')}
      >
        Pedidos web
        {total > 0 ? (
          <span
            aria-label={`${total} pedidos en espera`}
            className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-[0.625rem] font-bold text-warning-foreground"
          >
            {total}
          </span>
        ) : null}
      </Button>
      <WebOrdersModal
        open={open}
        onClose={() => setOpen(false)}
        wsToken={wsToken}
      />
    </>
  );
}
