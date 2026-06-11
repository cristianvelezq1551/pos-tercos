'use client';

import { useEffect, useRef } from 'react';
import { getReadyToCall } from '../api/client';
import { playReadyChime } from '../lib/ready-chime';

const POLL_MS = 5000;

/**
 * Vigía GLOBAL de pedidos listos: suena la campana cuando la cocina marca un
 * pedido LISTO, sin importar en qué página esté el cajero (Vender, Historial,
 * Caja…). Vive en el layout — TurnPanel solo muestra la cola, no suena (si
 * sonara también habría doble campana).
 */
export function ReadyChimeWatcher() {
  const prevPending = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const ready = await getReadyToCall();
        if (cancelled) return;
        const count = ready.orders.filter((o) => o.calledAt === null).length;
        if (prevPending.current !== null && count > prevPending.current) {
          playReadyChime();
        }
        prevPending.current = count;
      } catch {
        // sin red u otro error: el próximo tick reintenta
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return null;
}
