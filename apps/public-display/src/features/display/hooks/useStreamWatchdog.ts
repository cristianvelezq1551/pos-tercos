'use client';

import { useEffect, useRef } from 'react';
import type { StreamConnection } from './useDisplayStream';

const UNHEALTHY_RELOAD_MS = 180_000; // 3 min sin conexión sana → recargar
const CHECK_MS = 15_000;

/**
 * Auto-recovery por salud de conexión: si el SSE queda en estado distinto a
 * `live` de forma continua por más de [UNHEALTHY_RELOAD_MS] (server caído,
 * EventSource que no logra reconectar, proxy roto), recarga la página para
 * forzar SSR fresco + EventSource nuevo. Un período idle normal (sin cambios
 * de turno) NO dispara nada porque la conexión sigue `live`.
 */
export function useStreamWatchdog(connection: StreamConnection) {
  const unhealthySinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (connection === 'live') {
      unhealthySinceRef.current = null;
    } else if (unhealthySinceRef.current === null) {
      unhealthySinceRef.current = Date.now();
    }
  }, [connection]);

  useEffect(() => {
    const id = setInterval(() => {
      const since = unhealthySinceRef.current;
      if (since !== null && Date.now() - since > UNHEALTHY_RELOAD_MS) {
        window.location.reload();
      }
    }, CHECK_MS);
    return () => clearInterval(id);
  }, []);
}
