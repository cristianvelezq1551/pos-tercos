'use client';

import type { PublicWebOrder } from '@pos-tercos/types';
import { Button, cn } from '@pos-tercos/ui';
import { useEffect, useRef, useState } from 'react';
import { useWebOrdersSocket } from '../hooks/useWebOrdersSocket';
import { playWebOrderChime } from '../lib/order-chime';
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
  const { orders, connection } = useWebOrdersSocket(initial, wsToken);
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(initial.length);

  // Solo al ENTRAR un pedido nuevo (el contador sube): suena + pulsa. No al
  // bajar (cuando el cajero confirma/rechaza) ni al montar.
  useEffect(() => {
    if (orders.length > prevCount.current) {
      playWebOrderChime();
      setPulse(true);
      const id = setTimeout(() => setPulse(false), 4000);
      prevCount.current = orders.length;
      return () => clearTimeout(id);
    }
    prevCount.current = orders.length;
  }, [orders.length]);

  const total = orders.length;

  return (
    <>
      <Button
        variant={pulse ? 'default' : 'outline'}
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(
          'relative transition-all',
          pulse &&
            'scale-105 ring-2 ring-warning ring-offset-2 ring-offset-background motion-safe:animate-pulse',
        )}
      >
        {/* Punto de salud del canal en vivo: verde = WS conectado; ámbar =
            caído (los pedidos siguen llegando por el resync REST de 12s,
            pero sin sonido instantáneo). */}
        <span
          aria-label={
            connection === 'connected'
              ? 'Conexión en vivo activa'
              : 'Sin conexión en vivo — actualizando cada 12 segundos'
          }
          title={
            connection === 'connected'
              ? 'En vivo'
              : 'Sin conexión en vivo — actualizando cada 12 s'
          }
          className={cn(
            'mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full',
            connection === 'connected' ? 'bg-success' : 'bg-warning motion-safe:animate-pulse',
          )}
        />
        {/* En teléfono el texto largo desborda la barra: queda "Web" (el punto
            de estado y el contador siguen contando la historia completa). */}
        <span className="hidden xl:inline">{pulse ? '¡Nuevo pedido!' : 'Pedidos web'}</span>
        <span className="xl:hidden">{pulse ? '¡Nuevo!' : 'Web'}</span>
        {total > 0 ? (
          <span
            aria-label={`${total} pedidos pendientes por confirmar pago`}
            title="Pendientes por confirmar pago"
            className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-[0.625rem] font-bold text-warning-foreground"
          >
            {total}
          </span>
        ) : null}
      </Button>
      <WebOrdersModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
