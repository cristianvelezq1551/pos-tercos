'use client';

import type { PublicWebOrder } from '@pos-tercos/types';
import { useEffect, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { getWebOrder } from '../api/get-order';
import { isTerminalStatus } from '../store/active-order-store';

const POLL_INTERVAL_MS = 5_000;

export type OrderConnState = 'live' | 'reconnecting' | 'stopped';

/**
 * Polling cada 5s del estado de la orden, hasta que la página no tenga nada
 * más que mostrar (`isTerminalStatus`). Desde §7.v25 eso ocurre al CONFIRMARSE
 * EL PAGO: la web ya no cuenta el progreso del pedido, así que a partir de ahí
 * consultar sería gastar requests para redibujar lo mismo.
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

  // Deps SOLO [initial.id, token]: el interval se crea UNA vez y se detiene
  // solo cuando el status entra a terminal (clear interno), no en cada
  // transición. Antes dependía de order.status → cada cambio reiniciaba el
  // interval y disparaba un tick redundante.
  useEffect(() => {
    if (isTerminalStatus(initial.status)) {
      setConn('stopped');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const tick = async () => {
      try {
        const fresh = await getWebOrder(initial.id, token);
        if (cancelled) return;
        setOrder(fresh);
        if (isTerminalStatus(fresh.status)) {
          setConn('stopped');
          stop();
        } else {
          setConn('live');
        }
      } catch (e) {
        if (!cancelled) {
          setConn('reconnecting');
          logError('order-poll', e, { orderId: initial.id });
        }
      }
    };
    // Fetch inmediato (sin esperar el primer tick de 5s) + cada vez que la
    // pestaña vuelve a estar visible/enfocada — los browsers congelan los
    // timers en background, por eso antes solo se actualizaba "al dar tap".
    void tick();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // initial.status solo se lee para el guard inicial y es estable (initial es
    // el snapshot SSR, nunca se actualiza) → no reinicia el interval.
  }, [initial.id, initial.status, token]);

  return { order, conn };
}
