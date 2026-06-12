'use client';

import { useEffect, useRef } from 'react';
import { logError } from '../../../lib/client-log';

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 h

/** Un 401 puede ser transitorio (race con otra pestaña rotando el refresh
 *  token); recién al SEGUNDO consecutivo damos la sesión por muerta. */
const DEAD_AFTER_CONSECUTIVE_401 = 2;

/**
 * Mantiene la sesión viva sin intervención: cada 6 h (y al volver el foco a
 * la pestaña) renueva el access token (24 h) usando el refresh token (7 días)
 * vía POST /auth/refresh. Así una caja abierta varios días no se desloguea.
 *
 * Sesión MUERTA (refresh de 7 días vencido — tablet apagada una semana):
 * antes la app seguía intentando en silencio con todo fallando; ahora, tras
 * dos 401 consecutivos, manda al login con un destino claro.
 */
export function SessionKeeper() {
  const consecutive401 = useRef(0);

  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'X-Client-App': 'pos' },
          credentials: 'include',
        });
        if (res.ok) {
          consecutive401.current = 0;
          return;
        }
        if (res.status === 401 || res.status === 403) {
          consecutive401.current += 1;
          if (consecutive401.current >= DEAD_AFTER_CONSECUTIVE_401) {
            logError('session', 'refresh token vencido — redirigiendo a login');
            window.location.href = '/login';
          }
        }
      } catch {
        // Sin red: no es sesión muerta — el próximo intento decide.
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
