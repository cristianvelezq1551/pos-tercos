'use client';

import type { Socket } from 'socket.io-client';
import { fetchWsToken } from '../features/auth/api/ws-token';
import { logError } from './client-log';

/** Re-pedir token fresco como mucho cada 5 min (evita martillar /auth). */
const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Mantiene VIVA la autenticación de un socket a través de reconexiones:
 * el JWT del handshake inicial (SSR) vence (access 24h, rotación cada 6h);
 * sin esto, una reconexión horas después usa el token muerto y el socket
 * queda rechazado en silencio.
 *
 * - `reconnect_attempt`: refresca el token (throttled) y lo inyecta en
 *   `socket.auth` ANTES de que socket.io reintente el handshake.
 * - `connect_error` / `auth.error`: fuerza un refresh inmediato para que el
 *   PRÓXIMO intento ya salga con credencial nueva.
 *
 * Devuelve un dispose() para el cleanup del hook.
 */
export function keepSocketAuthFresh(socket: Socket): () => void {
  let lastRefresh = 0;
  let refreshing = false;

  const refresh = async (force = false) => {
    const now = Date.now();
    if (refreshing) return;
    if (!force && now - lastRefresh < MIN_REFRESH_INTERVAL_MS) return;
    refreshing = true;
    try {
      const token = await fetchWsToken();
      if (token) {
        lastRefresh = Date.now();
        socket.auth = { token };
      }
    } catch (err) {
      logError('socket-auth', err);
    } finally {
      refreshing = false;
    }
  };

  const onReconnectAttempt = () => void refresh();
  const onAuthFailure = () => void refresh(true);

  socket.io.on('reconnect_attempt', onReconnectAttempt);
  socket.on('connect_error', onAuthFailure);
  socket.on('auth.error', onAuthFailure);

  return () => {
    socket.io.off('reconnect_attempt', onReconnectAttempt);
    socket.off('connect_error', onAuthFailure);
    socket.off('auth.error', onAuthFailure);
  };
}
