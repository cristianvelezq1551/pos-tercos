'use client';

import { useEffect } from 'react';

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 h

/**
 * Mantiene la sesión viva sin intervención: cada 6 h (y al volver el foco a la
 * pestaña) renueva el access token (24 h) usando el refresh token (7 días) vía
 * POST /auth/refresh. Así una caja abierta varios días no se desloguea sola.
 * Fire-and-forget: un fallo no rompe nada (el middleware igual protege).
 */
export function SessionKeeper() {
  useEffect(() => {
    const refresh = () => {
      void fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'X-Client-App': 'admin' },
        credentials: 'include',
      }).catch(() => undefined);
    };
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
