import { logError } from '../../../lib/client-log';

/**
 * Token fresco para el handshake de WebSocket. La cookie httpOnly no viaja
 * cross-origin al WS, así que el socket autentica con un JWT explícito; este
 * endpoint lo renueva cuando el original venció (sesiones largas, tablet que
 * durmió la noche). Devuelve null si no hay sesión (el caller decide).
 * Portado de apps/pos (unificación POS+admin, Fase 2b).
 */
export async function fetchWsToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/ws-token', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const { token } = (await res.json()) as { token?: string };
    return token ?? null;
  } catch (err) {
    logError('ws-token', err);
    return null;
  }
}
