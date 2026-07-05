'use client';

import { useEffect, useRef } from 'react';
import { logError } from '../../../lib/client-log';

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 h
const DEAD_AFTER_CONSECUTIVE_401 = 2;

/** Mantiene la sesión viva: renueva el access (24h) con el refresh (7d) cada 6h
 *  y al volver el foco. Tras dos 401 seguidos, manda al login. */
export function SessionKeeper() {
  const consecutive401 = useRef(0);

  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'X-Client-App': 'cocina' },
          credentials: 'include',
        });
        if (res.ok) {
          consecutive401.current = 0;
          return;
        }
        if (res.status === 401 || res.status === 403) {
          consecutive401.current += 1;
          if (consecutive401.current >= DEAD_AFTER_CONSECUTIVE_401) {
            logError('session', 'refresh vencido — redirigiendo a login');
            window.location.href = '/login';
          }
        }
      } catch {
        // sin red: el próximo intento decide.
      }
    };
    const id = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
