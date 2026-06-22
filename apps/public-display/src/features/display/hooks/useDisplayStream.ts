'use client';

import {
  PublicDisplayStateSchema,
  type PublicDisplayState,
} from '@pos-tercos/types';
import { useEffect, useRef, useState } from 'react';

const API_PUBLIC_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const DEBOUNCE_MS = 200;
const STALE_AFTER_MS = 60_000;
const POLL_INTERVAL_MS = 30_000;
// Backoff exponencial 3s → 60s. NUNCA deja de reintentar: es un kiosko sin
// operador — la pantalla debe auto-recuperarse cuando vuelva el backend. El
// techo evita martillar al server durante una caída larga.
const RECONNECT_BACKOFF_MS = 3_000;
const RECONNECT_BACKOFF_MAX_MS = 60_000;
// El server emite un `ping` cada 20 s. Si pasan >45 s sin NINGÚN dato (ni ping
// ni state) con la conexión "viva", el SSE quedó ZOMBIE (socket abierto a nivel
// TCP pero el server colgado sin emitir): onerror no dispara, así que hay que
// detectarlo por silencio y forzar la reconexión.
const ZOMBIE_AFTER_MS = 45_000;
const HEALTH_CHECK_MS = 15_000;

export type StreamConnection = 'connecting' | 'live' | 'reconnecting';

/**
 * Conecta al SSE público y refresca el state.
 *  - `initial` (SSR) SOLO siembra el estado inicial; después manda el SSE.
 *    No se re-sincroniza con `initial` para no revertir el turno en vivo.
 *  - Debounce 200 ms + dedupe por `callSeq`: la pantalla solo re-renderiza
 *    cuando hay un llamado nuevo (incluido re-llamar el mismo número). Evita
 *    parpadeo del carrusel ante notifies de la cola que no son llamados.
 *  - Fallback poll: si el state quedó stale >60 s, refetchea `/state` cada 30 s.
 *  - Reconnect nativo del browser + recreación manual del EventSource si el
 *    browser lo cierra de forma permanente (ej. 502 en un redeploy).
 */
export function useDisplayStream(initial: PublicDisplayState) {
  const [state, setState] = useState<PublicDisplayState>(initial);
  const [connection, setConnection] = useState<StreamConnection>('connecting');
  const asOfRef = useRef(initial.asOf);

  useEffect(() => {
    let es: EventSource | null = null;
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingState: PublicDisplayState | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const flush = () => {
      if (pendingState) {
        const next = pendingState;
        asOfRef.current = next.asOf;
        // Solo re-render si hubo un llamado nuevo (callSeq cambió).
        setState((prev) => (prev.callSeq === next.callSeq ? prev : next));
      }
      pendingTimeout = null;
      pendingState = null;
    };

    let backoffMs = RECONNECT_BACKOFF_MS;
    let lastActivity = Date.now();

    const connect = () => {
      lastActivity = Date.now();
      es = new EventSource(`${API_PUBLIC_URL}/public-display/stream`);
      es.onopen = () => {
        backoffMs = RECONNECT_BACKOFF_MS;
        lastActivity = Date.now();
        setConnection('live');
      };
      // El keepalive del server llega como evento nombrado `ping` (no dispara
      // onmessage). Lo escuchamos solo para marcar que la conexión sigue viva.
      es.addEventListener('ping', () => {
        lastActivity = Date.now();
      });
      es.onmessage = (ev: MessageEvent<string>) => {
        lastActivity = Date.now();
        try {
          const parsed = PublicDisplayStateSchema.safeParse(JSON.parse(ev.data));
          if (!parsed.success) return;
          pendingState = parsed.data;
          if (pendingTimeout !== null) clearTimeout(pendingTimeout);
          pendingTimeout = setTimeout(flush, DEBOUNCE_MS);
        } catch {
          // ignore malformed
        }
      };
      es.onerror = () => {
        setConnection('reconnecting');
        // EventSource CLOSED = el browser no reintentará solo. Lo recreamos.
        if (es && es.readyState === EventSource.CLOSED && !closed) {
          es.close();
          if (reconnectTimer === null) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connect();
            }, backoffMs);
            backoffMs = Math.min(backoffMs * 2, RECONNECT_BACKOFF_MAX_MS);
          }
        }
      };
    };

    connect();

    // Watchdog anti-zombie: si la conexión está "viva" pero no llega nada
    // (ni ping) en >45 s, el SSE está colgado. close() no dispara onerror, así
    // que reconectamos a mano (fresh EventSource).
    const healthTimer = setInterval(() => {
      if (closed || !es) return;
      if (Date.now() - lastActivity > ZOMBIE_AFTER_MS) {
        setConnection('reconnecting');
        es.close();
        connect();
      }
    }, HEALTH_CHECK_MS);

    return () => {
      closed = true;
      if (pendingTimeout !== null) clearTimeout(pendingTimeout);
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      clearInterval(healthTimer);
      es?.close();
    };
  }, []);

  // Fallback poll cuando el state quedó stale (SSE silencioso).
  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      const ageMs = Date.now() - new Date(asOfRef.current).getTime();
      if (ageMs < STALE_AFTER_MS) return;
      try {
        const res = await fetch(`${API_PUBLIC_URL}/public-display/state`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json().catch(() => null)) as unknown;
        const parsed = PublicDisplayStateSchema.safeParse(json);
        if (parsed.success && !cancelled) {
          asOfRef.current = parsed.data.asOf;
          setState((prev) =>
            prev.callSeq === parsed.data.callSeq ? prev : parsed.data,
          );
        }
      } catch {
        // ignore — el SSE seguirá intentando reconectar
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { state, connection };
}
