'use client';

import type { PublicWebOrder } from '@pos-tercos/types';
import { Button } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { useWebOrdersSocket } from '../hooks/useWebOrdersSocket';
import { WebOrdersDrawer } from './WebOrdersDrawer';

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
  // Suscripción WS dedicada para la badge (drawer mantiene la suya — son
  // eventos broadcast a la misma room, ambas reciben las mismas updates).
  const { orders } = useWebOrdersSocket(initial, wsToken);
  const [pulse, setPulse] = useState(false);

  // Pulso visual cuando llega una orden nueva
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
        className={pulse ? 'animate-pulse' : ''}
      >
        Pedidos web
        {total > 0 ? (
          <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
            {total}
          </span>
        ) : null}
      </Button>
      <WebOrdersDrawer
        open={open}
        onClose={() => setOpen(false)}
        initial={initial}
        wsToken={wsToken}
      />
    </>
  );
}
