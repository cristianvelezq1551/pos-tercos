'use client';

import type { PublicWebOrder } from '@pos-tercos/types';
import { useEffect, useState } from 'react';
import { getWebOrder } from '../api/get-order';

const POLL_INTERVAL_MS = 5_000;

export type OrderConnState = 'live' | 'reconnecting' | 'stopped';

/**
 * Polling cada 5s del estado de la orden. Detiene el polling cuando el
 * status entra a un terminal/no-cocina state (ENTREGADO, CANCELADO_*, VOID)
 * — el cliente puede recargar manualmente.
 *
 * Razones para POLL en vez de SSE:
 *  - Ya hay rate-limit (120/60s para GET) y polling cada 5s = 12/min, OK.
 *  - Evita conexiones colgadas a clientes en pestañas inactivas (browsers
 *    pausan setInterval). SSE quedaría open consumiendo recursos del API.
 *  - Cliente pierde conexión: getWebOrder lanza, mostramos badge.
 */
export function useOrderPoller(initial: PublicWebOrder, token: string) {
  const [order, setOrder] = useState<PublicWebOrder>(initial);
  const [conn, setConn] = useState<OrderConnState>('live');

  useEffect(() => {
    if (isTerminal(order.status)) {
      setConn('stopped');
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const fresh = await getWebOrder(initial.id, token);
        if (cancelled) return;
        setOrder(fresh);
        setConn('live');
      } catch {
        if (!cancelled) setConn('reconnecting');
      }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [initial.id, token, order.status]);

  return { order, conn };
}

function isTerminal(status: string): boolean {
  return [
    'ENTREGADO',
    'CANCELADO_NO_PAGO',
    'CANCELADO_SIN_REEMBOLSO',
    'VOID',
  ].includes(status);
}
