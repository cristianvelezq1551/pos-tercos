'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConnectivityStatus } from '../lib/types';

const HEARTBEAT_MS = 12_000;
const HEARTBEAT_TIMEOUT_MS = 4_000;
/** Fallos seguidos antes de declarar offline (evita parpadeo por un request perdido). */
const FAILS_TO_OFFLINE = 2;

/**
 * Estado de conexión REAL con el backend. `navigator.onLine` miente (dice
 * online aunque la API esté caída), así que lo combinamos con un heartbeat
 * activo a `/api/healthz`. Para caer a `offline` exige 2 fallos seguidos; para
 * volver a `online`, 1 éxito basta.
 */
export function useConnectivity(): ConnectivityStatus {
  const [status, setStatus] = useState<ConnectivityStatus>('checking');
  const failsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const ping = async (): Promise<void> => {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), HEARTBEAT_TIMEOUT_MS);
      try {
        const res = await fetch('/api/healthz', {
          method: 'GET',
          cache: 'no-store',
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        // Cinturón además del status HTTP: si algún proxy respondiera 200 con
        // el backend degradado (DB caída), el body lo delata — "online" con la
        // DB muerta es el peor estado posible (ni cobra ni encola offline).
        const body = (await res.json().catch(() => null)) as { status?: string } | null;
        if (body?.status !== 'ok') throw new Error(`health degraded: ${body?.status}`);
        if (cancelled) return;
        failsRef.current = 0;
        setStatus('online');
      } catch {
        if (cancelled) return;
        failsRef.current += 1;
        if (failsRef.current >= FAILS_TO_OFFLINE) setStatus('offline');
      } finally {
        clearTimeout(to);
      }
    };

    const loop = async (): Promise<void> => {
      await ping();
      if (!cancelled) timer = setTimeout(loop, HEARTBEAT_MS);
    };

    // Eventos del navegador: aceleran la reacción pero no son la verdad final.
    const onOffline = (): void => {
      failsRef.current = FAILS_TO_OFFLINE;
      setStatus('offline');
    };
    const onOnline = (): void => {
      void ping();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    void loop();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return status;
}
